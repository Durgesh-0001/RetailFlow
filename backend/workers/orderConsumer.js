/**
 * workers/orderConsumer.js  —  RetailFlow Asynchronous Order Consumer Worker
 * ═════════════════════════════════════════════════════════════════════════
 * Continuous background worker pulling from 'retailflow.orders.v1'.
 * Employs ioredis-backed idempotency protection and atomic Mongoose transactions.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const { Kafka, logLevel } = require('kafkajs');
const Redis = require('ioredis');

const connectDB = require('../config/db');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Sale = require('../models/Sale');

// ── 1. INITIALISE DATABASE CONNECTION ────────────────────────────────────────
connectDB();

// ── 2. INITIALISE REDIS CONNECTION POOL ──────────────────────────────────────
const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || '6379'}`;
console.log(`🔌 Connecting Redis client to: ${redisUrl}...`);

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  reconnectOnError: (err) => {
    if (err.message.includes('READONLY')) {
      return true; // Reconnect automatically on master-failovers (Redis Cluster)
    }
    return false;
  }
});

redis.on('connect', () => console.log('✅ Redis connection established successfully.'));
redis.on('error', (err) => console.error('❌ Redis connection pool error:', err.message));

// ── 3. INITIALISE KAFKA CLIENT & CONSUMER ────────────────────────────────────
const brokerString = process.env.KAFKA_BROKERS || 'localhost:9092';
const brokers = brokerString.split(',').map(b => b.trim());

const kafka = new Kafka({
  clientId: 'retailflow-order-worker',
  brokers: brokers,
  logLevel: logLevel.WARN
});

const consumer = kafka.consumer({
  groupId: 'retailflow-order-workers',
  sessionTimeout: 30000,
  heartbeatInterval: 10000
});

/**
 * Core consumer daemon bootstrapper
 */
async function startConsumer() {
  console.log(`🔌 Subscribing worker to topic 'retailflow.orders.v1'...`);
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'retailflow.orders.v1', fromBeginning: true });
    console.log('✅ Kafka Consumer worker successfully subscribed.');

    // ── 4. EVENT POLLING LOOP ───────────────────────────────────────────────
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const correlationId = message.headers?.correlation_id?.toString() || message.key?.toString();
        
        let data;
        try {
          data = JSON.parse(message.value.toString());
        } catch (err) {
          console.error(`❌ [Trace ID: ${correlationId}] Malformed JSON event parsed. Discarding:`, err.message);
          return;
        }

        const requestId = data.request_id || message.key?.toString();
        console.log(`📥 [Trace ID: ${correlationId}] [Kafka Consumer] Pulling order message. Partition: ${partition}`);

        // ── 5. IDEMPOTENCY GUARD LAYER (Redis check) ───────────────────────
        const redisKey = `retailflow:order:idempotency:${requestId}`;
        
        const isDuplicate = await redis.get(redisKey);
        if (isDuplicate) {
          console.warn(`⚠️ [Trace ID: ${correlationId}] [Kafka Consumer] Discarding duplicate event. request_id already processed.`);
          return; // Safe discard to prevent Kafka duplicate write loops (At-Least-Once Delivery safety)
        }

        // Reserve key in Redis immediately with 24 Hours TTL (86400 seconds)
        await redis.setex(redisKey, 86400, 'processing');

        // ── 6. ATOMIC TRANSACTION LAYER (Mongoose Transactions) ────────────
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
          const { payload, userId } = data;
          const itemsList = payload.meta?.items || [];
          const orderItems = [];
          const orderSummary = [];
          let totalAmount = 0;
          let totalCOGS = 0;

          if (itemsList.length === 0) {
            throw new Error('Order items list is empty.');
          }

          // Process each order item atomically within the Mongoose Session
          for (const item of itemsList) {
            let dbProd = await Product.findOne({
              name: { $regex: new RegExp(`^${item.name?.trim()}$`, 'i') }
            }).session(session);

            if (!dbProd && item.product_id) {
              dbProd = await Product.findById(item.product_id).session(session);
            }

            if (!dbProd) {
              throw new Error(`Product not found in stock: ${item.name || item.product_id}`);
            }

            const qty = Number(item.quantity || 1);

            // Deduct stock safely inside transaction
            if (dbProd.quantity < qty) {
              console.warn(`[Trace ID: ${correlationId}] Insufficient stock for ${dbProd.name}. Current: ${dbProd.quantity}, Requested: ${qty}. Capping deduction.`);
              dbProd.quantity = 0;
            } else {
              dbProd.quantity -= qty;
            }
            await dbProd.save({ session });

            const subtotal = dbProd.sellingPrice * qty;
            totalAmount += subtotal;
            totalCOGS += dbProd.costPrice * qty;

            orderItems.push({
              product: dbProd._id,
              productName: dbProd.name,
              sku: dbProd.sku,
              unitPrice: dbProd.sellingPrice,
              costPrice: dbProd.costPrice,
              quantity: qty,
              subtotal
            });
            orderSummary.push(`${qty} ${dbProd.name}`);
          }

          // Create standard Mongoose Order document
          const today = new Date();
          const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
          const orderCount = await Order.countDocuments({}).session(session);
          const orderNumber = `ORD-${dateStr}-${String(orderCount + 1).padStart(3, '0')}`;

          const newOrder = await Order.create([{
            shop: userId || new mongoose.Types.ObjectId(), // Org scope assignment
            orderNumber,
            customer: {
              name: payload.meta?.customerName || 'Walk-in Customer'
            },
            items: orderItems,
            totalAmount,
            finalAmount: totalAmount,
            status: 'Completed'
          }], { session });

          // Create corresponding Sales ledger record
          await Sale.create([{
            shop: userId || new mongoose.Types.ObjectId(),
            order: newOrder[0]._id,
            revenue: totalAmount,
            costOfGoodsSold: totalCOGS,
            date: new Date(),
            notes: `Async Event Order: ${orderSummary.join(', ')}`,
          }], { session });

          // Commit transaction atomically
          await session.commitTransaction();
          session.endSession();

          // Mark Redis idempotency key as fully complete
          await redis.setex(redisKey, 86400, 'completed');
          console.log(`✅ [Trace ID: ${correlationId}] [Kafka Consumer] Order processed successfully. Order Number: ${orderNumber}`);

        } catch (dbErr) {
          // Abort transaction to prevent orphan stock changes or partial writes
          console.error(`❌ [Trace ID: ${correlationId}] [Kafka Consumer] Mongoose Transaction aborted. Rolling back changes.`);
          console.error(`   Rollback Reason: ${dbErr.message}`);
          await session.abortTransaction();
          session.endSession();

          // Clear Redis key block to allow potential retries of this message
          await redis.del(redisKey);
          throw dbErr; // Throw to trigger KafkaJS standard offset retry policy
        }
      }
    });

  } catch (err) {
    console.error('💥 [RetailFlow Kafka Consumer] Fatal worker exception:', err.message);
  }
}

// ── 5. GRACEFUL WORKER SHUTDOWN HOOKS ────────────────────────────────────────
const handleShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down worker...`);
  try {
    await consumer.disconnect();
    console.log('✅ Kafka Consumer disconnected.');
    await redis.quit();
    console.log('✅ Redis pool connections closed.');
    await mongoose.disconnect();
    console.log('✅ MongoDB connection closed. Exiting.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown operations:', err.message);
    process.exit(1);
  }
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

startConsumer();
