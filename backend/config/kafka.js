/**
 * config/kafka.js — RetailFlow Kafka Client Configuration
 * ───────────────────────────────────────────────────────────
 * Manages the lifespan of the Kafka client, shared producer,
 * event listeners, and topic definitions.
 */

process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';
const { Kafka, logLevel, Partitioners } = require('kafkajs');

// Topic Definitions
const TOPICS = {
  ORDERS: 'retailflow.orders.v1',
  INVENTORY: 'retailflow.inventory.v1',
  NOTIFICATIONS: 'retailflow.notifications.v1',
  ANALYTICS: 'retailflow.analytics.v1',
};

// Broker strings
const brokerString = process.env.KAFKA_BROKERS || 'localhost:9094,localhost:9092';
const brokers = brokerString
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

// Kafka Client
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'retailflow-backend-v2',
  brokers,
  logLevel: logLevel.NOTHING,
  retry: {
    initialRetryTime: 300,
    retries: 5,
  },
});

// Singleton Producer instance
const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
  allowAutoTopicCreation: true,
  transactionTimeout: 15000,
});

let isProducerConnected = false;
let isConnecting = false;

// Register producer lifecycle event listeners to keep state accurate in real time
producer.on(producer.events.CONNECT, () => {
  isProducerConnected = true;
  isConnecting = false;
  console.log('✅ Kafka Producer connected successfully.');
});

producer.on(producer.events.DISCONNECT, () => {
  isProducerConnected = false;
  isConnecting = false;
  console.log('⚠️ Kafka Producer disconnected.');
});

/**
 * Connect the Kafka Producer (with automatic retry and non-blocking timeout)
 */
async function connectProducer(timeoutMs = 8000) {
  if (isProducerConnected) return producer;
  if (isConnecting) return producer;

  isConnecting = true;
  console.log(`🔌 Initialising Kafka connection to brokers: [${brokers.join(', ')}]...`);

  const connectPromise = producer.connect().then(() => {
    isProducerConnected = true;
    isConnecting = false;
    return producer;
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Kafka connection timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  try {
    await Promise.race([connectPromise, timeoutPromise]);
  } catch (err) {
    isConnecting = false;
    console.warn('⚠️ [RetailFlow Kafka] Producer connection timed out or unavailable. Producer will connect in background.');
  }

  return producer;
}

/**
 * Disconnect the producer gracefully
 */
async function disconnectProducer() {
  if (!isProducerConnected) return;

  console.log('🔌 Disconnecting Kafka Producer...');
  try {
    await producer.disconnect();
    isProducerConnected = false;
    console.log('✅ Kafka Producer disconnected gracefully.');
  } catch (err) {
    console.error('[RetailFlow Kafka] Producer disconnection error:', err.message);
  }
}

/**
 * Factory helper for creating typed Kafka consumers with a distinct group ID
 */
function createConsumer(groupId, options = {}) {
  return kafka.consumer({
    groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 10000,
    ...options,
  });
}

module.exports = {
  kafka,
  producer,
  TOPICS,
  connectProducer,
  disconnectProducer,
  createConsumer,
  isProducerConnected: () => isProducerConnected,
};
