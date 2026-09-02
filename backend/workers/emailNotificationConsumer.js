/**
 * workers/emailNotificationConsumer.js — RetailFlow Email Notification Consumer
 * ─────────────────────────────────────────────────────────────────────────────
 * Background Kafka consumer dedicated to processing order events and sending
 * automated email confirmations, tax receipts, and status updates.
 * Consumer Group: 'retailflow-notification-group'
 * Employs Redis-backed idempotency protection to prevent duplicate emails.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const { createConsumer, TOPICS } = require('../config/kafka');
const connectDB = require('../config/db');
const redisService = require('../services/redisService');
const emailService = require('../services/emailService');
const User = require('../models/User');

const CONSUMER_GROUP = 'retailflow-notification-group';
let consumer = null;
let isRunning = false;

async function startEmailNotificationConsumer() {
  if (isRunning) return;

  try {
    await connectDB();
    consumer = createConsumer(CONSUMER_GROUP);

    console.log(`🔌 [EmailNotificationConsumer] Connecting and subscribing to '${TOPICS.ORDERS}' (Group: '${CONSUMER_GROUP}')...`);
    await consumer.connect();
    await consumer.subscribe({ topic: TOPICS.ORDERS, fromBeginning: false });
    isRunning = true;
    console.log(`✅ [EmailNotificationConsumer] Successfully connected & subscribed to ${TOPICS.ORDERS}`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const correlationId = message.headers?.correlation_id?.toString() || message.key?.toString();
        let parsed;

        try {
          parsed = JSON.parse(message.value.toString());
        } catch (err) {
          console.error(`❌ [EmailNotificationConsumer] [Corr: ${correlationId}] Malformed JSON event:`, err.message);
          return;
        }

        const { eventId, eventType, shopId, payload } = parsed;
        const idempotencyKey = `idempotency:email:${eventType}:${eventId || correlationId}`;

        // ── 1. Idempotency Guard (Redis) ──────────────────────────────────
        const isLockAcquired = await redisService.acquireIdempotencyLock(idempotencyKey, 86400);
        if (!isLockAcquired) {
          console.warn(`⚠️ [EmailNotificationConsumer] Duplicate email event detected for: ${idempotencyKey}. Skipping.`);
          return;
        }

        console.log(`\n📧 [EmailNotificationConsumer] [Corr: ${correlationId}] Processing email notification for '${eventType}' (EventId: ${eventId})`);

        try {
          // Fetch shop details for branding & owner alert (with payload fallback)
          let shop = null;
          if (shopId && mongoose.isValidObjectId(shopId)) {
            shop = await User.findById(shopId).select('shopName ownerName email currency currencySymbol');
          }

          const shopData = shop || {
            _id: shopId,
            email: payload.ownerEmail,
            ownerName: payload.ownerName || 'Store Owner',
            shopName: payload.shopName || 'RetailFlow Store',
            currencySymbol: '₹',
          };

          // ── 2. Handle ORDER_CREATED ──────────────────────────────────────
          if (eventType === 'ORDER_CREATED') {
            const orderData = {
              _id: payload.orderId,
              orderNumber: payload.orderNumber,
              customer: payload.customer,
              items: payload.items || [],
              totalAmount: payload.totalAmount,
              discount: payload.discount || 0,
              finalAmount: payload.finalAmount,
              status: payload.status || 'Completed',
              createdAt: payload.createdAt || Date.now(),
              shop: shopId,
            };

            const dispatches = await emailService.sendOrderConfirmation(orderData, shopData);
            console.log(`✅ [EmailNotificationConsumer] Order confirmation email dispatched for order: ${payload.orderNumber} (${dispatches?.length || 0} recipient(s))`);
          }

          // ── 3. Handle ORDER_STATUS_UPDATED / ORDER_COMPLETED / ORDER_CANCELLED
          else if (
            eventType === 'ORDER_STATUS_UPDATED' ||
            eventType === 'ORDER_COMPLETED' ||
            eventType === 'ORDER_CANCELLED'
          ) {
            const orderData = {
              _id: payload.orderId,
              orderNumber: payload.orderNumber,
              customer: payload.customer,
              status: payload.newStatus || payload.status,
              finalAmount: payload.finalAmount,
              shop: shopId,
            };

            await emailService.sendOrderStatusUpdate(orderData, payload.previousStatus, shopData);
            console.log(`✅ [EmailNotificationConsumer] Status update email dispatched for order: ${payload.orderNumber}`);
          }

          // Mark Redis idempotency key as completed
          await redisService.completeIdempotency(idempotencyKey, 86400);
        } catch (err) {
          console.error(`❌ [EmailNotificationConsumer] Error processing notification for ${eventType}:`, err.message);
          await redisService.releaseIdempotencyLock(idempotencyKey);
        }
      },
    });
  } catch (err) {
    isRunning = false;
    console.error('💥 [EmailNotificationConsumer] Connection error:', err.message);
  }
}

async function stopEmailNotificationConsumer() {
  if (consumer && isRunning) {
    try {
      await consumer.disconnect();
      isRunning = false;
      console.log('✅ [EmailNotificationConsumer] Disconnected gracefully.');
    } catch (err) {
      console.error('[EmailNotificationConsumer] Disconnect error:', err.message);
    }
  }
}

// Graceful shutdown
const handleShutdown = async (signal) => {
  console.log(`\n🛑 [EmailNotificationConsumer] Received ${signal}. Shutting down...`);
  try {
    await stopEmailNotificationConsumer();
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
  startEmailNotificationConsumer();
}

module.exports = { startEmailNotificationConsumer, stopEmailNotificationConsumer, getConsumer: () => consumer };
