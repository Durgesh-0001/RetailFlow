/**
 * workers/index.js — Unified Background Workers Daemon
 * ───────────────────────────────────────────────────────
 * Boots all 3 Kafka consumer workers concurrently:
 *  1. Order Processing Consumer (Fulfillment & Transactions)
 *  2. Email Notification Consumer (Receipts & Alerts)
 *  3. Real-Time Analytics Consumer (Counters & Cache Invalidation)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { startOrderConsumer, stopOrderConsumer } = require('./orderConsumer');
const { startEmailNotificationConsumer, stopEmailNotificationConsumer } = require('./emailNotificationConsumer');
const { startAnalyticsConsumer, stopAnalyticsConsumer } = require('./analyticsConsumer');
const connectDB = require('../config/db');

let isStarted = false;

async function startAllWorkers() {
  if (isStarted) return;
  isStarted = true;

  console.log('════════════════════════════════════════════════════════════');
  console.log('  🚀 Starting RetailFlow Kafka Consumer Workers Daemon');
  console.log('════════════════════════════════════════════════════════════\n');

  try {
    await connectDB();

    console.log('🚀 Initializing all Kafka consumers concurrently...');

    // Launch all 3 consumers concurrently
    await Promise.all([
      startOrderConsumer(),
      startEmailNotificationConsumer(),
      startAnalyticsConsumer(),
    ]);

    console.log('\n🟢 All RetailFlow workers are actively listening for events.\n');
  } catch (err) {
    console.error('💥 Fatal error starting workers daemon:', err.message);
  }
}

async function stopAllWorkers() {
  if (!isStarted) return;
  console.log('🛑 [Workers Daemon] Disconnecting all consumers...');
  try {
    await Promise.allSettled([
      stopOrderConsumer(),
      stopEmailNotificationConsumer(),
      stopAnalyticsConsumer(),
    ]);
    isStarted = false;
    console.log('✅ All Kafka consumers disconnected.');
  } catch (err) {
    console.error('Error during workers shutdown:', err.message);
  }
}

// Graceful shutdown for standalone CLI execution
const handleGlobalShutdown = async (signal) => {
  console.log(`\n🛑 [Workers Daemon] Received ${signal}.`);
  await stopAllWorkers();
  process.exit(0);
};

process.on('SIGINT', () => handleGlobalShutdown('SIGINT'));
process.on('SIGTERM', () => handleGlobalShutdown('SIGTERM'));

if (require.main === module) {
  startAllWorkers();
}

module.exports = { startAllWorkers, stopAllWorkers };
