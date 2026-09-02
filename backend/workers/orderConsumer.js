/**
 * workers/orderConsumer.js — RetailFlow Asynchronous Order Processing Worker
 * ─────────────────────────────────────────────────────────────────────────
 * Continuous background worker subscribed to 'retailflow.orders.v1'.
 * Consumer Group: 'retailflow-order-workers'
 * Employs Redis-backed atomic idempotency protection and Mongoose transaction safety.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const { createConsumer, TOPICS } = require('../config/kafka');
const connectDB = require('../config/db');
const redisService = require('../services/redisService');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Sale = require('../models/Sale');

const CONSUMER_GROUP = 'retailflow-order-workers';
let consumer = null;
let isRunning = false;

async function startOrderConsumer() {
  if (isRunning) return;

  try {
    await connectDB();
    consumer = createConsumer(CONSUMER_GROUP);

    console.log(`🔌 [OrderConsumer] Connecting and subscribing to '${TOPICS.ORDERS}' (Group: '${CONSUMER_GROUP}')...`);
    await consumer.connect();
    await consumer.subscribe({ topic: TOPICS.ORDERS, fromBeginning: false });
    isRunning = true;
    console.log(`✅ [OrderConsumer] Successfully connected & subscribed to ${TOPICS.ORDERS}`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const correlationId = message.headers?.correlation_id?.toString() || message.key?.toString();
        let parsed;

        try {
          parsed = JSON.parse(message.value.toString());
        } catch (err) {
          console.error(`❌ [OrderConsumer] [Corr: ${correlationId}] Malformed JSON event:`, err.message);
          return;
        }

        const { eventId, eventType, shopId, payload } = parsed;

        // If this is an ASYNC_PLACE_ORDER event, execute the order processing transaction
        if (eventType === 'ASYNC_PLACE_ORDER') {
          const idempotencyKey = `idempotency:order:${eventId || message.key?.toString()}`;
          const isLockAcquired = await redisService.acquireIdempotencyLock(idempotencyKey, 86400);

          if (!isLockAcquired) {
            console.warn(`⚠️ [OrderConsumer] Duplicate event detected for key: ${idempotencyKey}. Discarding.`);
            return;
          }

          console.log(`📥 [OrderConsumer] [Corr: ${correlationId}] Processing ASYNC_PLACE_ORDER transaction (EventId: ${eventId})`);

          const session = await mongoose.startSession();
          session.startTransaction();

          try {
            const itemsList = payload?.items || [];
            if (itemsList.length === 0) {
              throw new Error('Order items list is empty.');
            }

            let totalAmount = 0;
            let totalCOGS = 0;
            const orderItems = [];

            for (const item of itemsList) {
              let dbProd = await Product.findOne({
                shop: shopId,
                $or: [
                  { _id: mongoose.isValidObjectId(item.product) ? item.product : undefined },
                  { name: { $regex: new RegExp(`^${item.name?.trim()}$`, 'i') } },
                ].filter(Boolean),
              }).session(session);

              if (!dbProd) {
                throw new Error(`Product not found: ${item.name || item.product}`);
              }

              const qty = Number(item.quantity || 1);
              if (dbProd.quantity < qty) {
                console.warn(`[OrderConsumer] Insufficient stock for ${dbProd.name}. Available: ${dbProd.quantity}, Capping.`);
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
                subtotal,
              });
            }

            const [newOrder] = await Order.create(
              [{
                shop: shopId,
                customer: payload.customer || { name: 'Walk-in Customer' },
                items: orderItems,
                totalAmount,
                discount: payload.discount || 0,
                finalAmount: Math.max(0, totalAmount - (payload.discount || 0)),
                status: 'Completed',
              }],
              { session }
            );

            await Sale.create(
              [{
                shop: shopId,
                order: newOrder._id,
                revenue: newOrder.finalAmount,
                costOfGoodsSold: totalCOGS,
                date: new Date(),
                notes: `Async Order: ${newOrder.orderNumber}`,
              }],
              { session }
            );

            await session.commitTransaction();
            session.endSession();

            await redisService.completeIdempotency(idempotencyKey, 86400);
            console.log(`✅ [OrderConsumer] Order ${newOrder.orderNumber} successfully processed.`);
          } catch (txErr) {
            await session.abortTransaction();
            session.endSession();
            await redisService.releaseIdempotencyLock(idempotencyKey);
            console.error(`❌ [OrderConsumer] Transaction failed:`, txErr.message);
          }
        }
      },
    });
  } catch (err) {
    isRunning = false;
    console.error('💥 [OrderConsumer] Connection error:', err.message);
  }
}

async function stopOrderConsumer() {
  if (consumer && isRunning) {
    try {
      await consumer.disconnect();
      isRunning = false;
      console.log('✅ [OrderConsumer] Disconnected gracefully.');
    } catch (err) {
      console.error('[OrderConsumer] Disconnect error:', err.message);
    }
  }
}

// Graceful shutdown
const handleShutdown = async (signal) => {
  console.log(`\n🛑 [OrderConsumer] Received ${signal}. Shutting down...`);
  try {
    await stopOrderConsumer();
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err.message);
    process.exit(1);
  }
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

if (require.main === module) {
  startOrderConsumer();
}

module.exports = { startOrderConsumer, stopOrderConsumer, getConsumer: () => consumer };
