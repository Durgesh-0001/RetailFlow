/**
 * config/redis.js — RetailFlow Redis Client Configuration
 * ───────────────────────────────────────────────────────────
 * Provides a resilient, centralized Redis connection pool using ioredis.
 */

const Redis = require('ioredis');

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6380;
const redisPassword = process.env.REDIS_PASSWORD || undefined;

const redisOptions = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  reconnectOnError(err) {
    if (err.message.includes('READONLY')) {
      return true; // Reconnect automatically on Redis cluster failovers
    }
    return false;
  },
};

const redisUrl = process.env.REDIS_URL;
const redis = redisUrl ? new Redis(redisUrl, redisOptions) : new Redis(redisOptions);

let isRedisConnected = false;

redis.on('connect', () => {
  isRedisConnected = true;
  console.log(`✅ Redis connected at ${redisHost}:${redisPort}`);
});

redis.on('ready', () => {
  isRedisConnected = true;
});

redis.on('error', (err) => {
  isRedisConnected = false;
  console.warn(`⚠️ [RetailFlow Redis] Connection error: ${err.message}`);
});

redis.on('close', () => {
  isRedisConnected = false;
});

/**
 * Disconnect Redis gracefully
 */
async function disconnectRedis() {
  try {
    await redis.quit();
    console.log('✅ Redis client disconnected gracefully.');
  } catch (err) {
    console.error('[RetailFlow Redis] Disconnect error:', err.message);
  }
}

/**
 * Check if Redis is healthy
 */
async function isRedisHealthy() {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

module.exports = {
  redis,
  disconnectRedis,
  isRedisHealthy,
  isRedisConnected: () => isRedisConnected,
};
