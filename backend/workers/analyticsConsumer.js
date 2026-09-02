/**
 * workers/analyticsConsumer.js — RetailFlow Real-Time Analytics Consumer
 * ──────────────────────────────────────────────────────────────────────
 * Background Kafka consumer updating real-time Redis analytics counters
 * and invalidating stale analytics cache aggregates upon receiving order events.
 * Consumer Group: 'retailflow-analytics-group'
 * Employs Redis-backed idempotency protection.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const { createConsumer, TOPICS } = require('../config/kafka');
const connectDB = require('../config/db');
const redisService = require('../services/redisService');

const CONSUMER_GROUP = 'retailflow-analytics-group';
let consumer = null;
let isRunning = false;

async function startAnalyticsConsumer() {
  if (isRunning) return;

  try {
    await connectDB();
    consumer = createConsumer(CONSUMER_GROUP);

    console.log(`🔌 [AnalyticsConsumer] Connecting and subscribing to '${TOPICS.ORDERS}' (Group: '${CONSUMER_GROUP}')...`);
    await consumer.connect();
    await consumer.subscribe({ topic: TOPICS.ORDERS, fromBeginning: false });
    isRunning = true;
    console.log(`✅ [AnalyticsConsumer] Successfully connected & subscribed to ${TOPICS.ORDERS}`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const correlationId = message.headers?.correlation_id?.toString() || message.key?.toString();
        let parsed;

        try {
          parsed = JSON.parse(message.value.toString());
        } catch (err) {
          console.error(`❌ [AnalyticsConsumer] [Corr: ${correlationId}] Malformed JSON event:`, err.message);
          return;
        }

        const { eventId, eventType, shopId, payload } = parsed;
        const idempotencyKey = `idempotency:analytics:${eventType}:${eventId || correlationId}`;

        // ── 1. Idempotency Guard (Redis) ──────────────────────────────────
        const isLockAcquired = await redisService.acquireIdempotencyLock(idempotencyKey, 86400);
        if (!isLockAcquired) {
          console.warn(`⚠️ [AnalyticsConsumer] Duplicate analytics event detected for: ${idempotencyKey}. Skipping.`);
          return;
        }

        console.log(`\n📊 [AnalyticsConsumer] [Corr: ${correlationId}] Aggregating metrics for '${eventType}' (EventId: ${eventId})`);

        try {
          const today = new Date().toISOString().slice(0, 10);
          const revenueKey = `analytics:today:revenue:${shopId}:${today}`;
          const ordersKey  = `analytics:today:orders:${shopId}:${today}`;

          // ── 2. Update Real-Time Redis Counters ──────────────────────────
          if (eventType === 'ORDER_CREATED' || eventType === 'ORDER_COMPLETED') {
            const amount = Number(payload.finalAmount || payload.totalAmount || 0);
            if (amount > 0) {
              await redisService.incrementCounter(revenueKey, amount, 86400 * 2);
            }
            await redisService.incrementCounter(ordersKey, 1, 86400 * 2);
            console.log(`📈 [AnalyticsConsumer] Updated real-time counters: Revenue +₹${amount}, Orders +1`);
          } else if (eventType === 'ORDER_CANCELLED') {
            const amount = Number(payload.finalAmount || payload.totalAmount || 0);
            if (amount > 0) {
              await redisService.incrementCounter(revenueKey, -amount, 86400 * 2);
            }
            console.log(`📉 [AnalyticsConsumer] Adjusted revenue counter for cancellation: -₹${amount}`);
          }

          // ── 3. Invalidate Stale Analytics & Overview Caches ───────────────
          if (shopId) {
            await Promise.all([
              redisService.invalidatePattern(`cache:analytics:*:${shopId}`),
              redisService.invalidatePattern(`cache:http:${shopId}:*`),
            ]);
            console.log(`🧹 [AnalyticsConsumer] Flushed analytics & HTTP caches for shop: ${shopId}`);
          }

          // Mark Redis idempotency key as completed
          await redisService.completeIdempotency(idempotencyKey, 86400);
        } catch (err) {
          console.error(`❌ [AnalyticsConsumer] Error updating analytics for ${eventType}:`, err.message);
          await redisService.releaseIdempotencyLock(idempotencyKey);
        }
      },
    });
  } catch (err) {
    isRunning = false;
    console.error('💥 [AnalyticsConsumer] Connection error:', err.message);
  }
}

async function stopAnalyticsConsumer() {
  if (consumer && isRunning) {
    try {
      await consumer.disconnect();
      isRunning = false;
      console.log('✅ [AnalyticsConsumer] Disconnected gracefully.');
    } catch (err) {
      console.error('[AnalyticsConsumer] Disconnect error:', err.message);
    }
  }
}

// Graceful shutdown
const handleShutdown = async (signal) => {
  console.log(`\n🛑 [AnalyticsConsumer] Received ${signal}. Shutting down...`);
  try {
    await stopAnalyticsConsumer();
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
  startAnalyticsConsumer();
}

module.exports = { startAnalyticsConsumer, stopAnalyticsConsumer, getConsumer: () => consumer };
