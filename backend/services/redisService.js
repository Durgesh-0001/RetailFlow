/**
 * services/redisService.js — High-Performance Redis Utilities
 * ─────────────────────────────────────────────────────────────
 * Provides caching, TTL management, atomic idempotency guards,
 * real-time counters, and pattern-based cache invalidation.
 */

const { redis, isRedisHealthy } = require('../config/redis');

class RedisService {
  /**
   * Get cached JSON data
   */
  async get(key) {
    try {
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (err) {
      console.warn(`[RedisService] GET error for key ${key}:`, err.message);
      return null;
    }
  }

  /**
   * Set JSON data with TTL (in seconds)
   */
  async set(key, value, ttlSeconds = 300) {
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await redis.setex(key, ttlSeconds, payload);
      } else {
        await redis.set(key, payload);
      }
      return true;
    } catch (err) {
      console.warn(`[RedisService] SET error for key ${key}:`, err.message);
      return false;
    }
  }

  /**
   * Delete single or multiple keys
   */
  async del(keys) {
    try {
      const keyList = Array.isArray(keys) ? keys : [keys];
      if (keyList.length === 0) return 0;
      return await redis.del(...keyList);
    } catch (err) {
      console.warn('[RedisService] DEL error:', err.message);
      return 0;
    }
  }

  /**
   * Invalidate all keys matching a wildcard pattern (e.g. `cache:analytics:shop123:*`)
   */
  async invalidatePattern(pattern) {
    try {
      const stream = redis.scanStream({
        match: pattern,
        count: 100,
      });

      const keysToDelete = [];
      for await (const resultKeys of stream) {
        if (resultKeys.length) {
          keysToDelete.push(...resultKeys);
        }
      }

      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
        console.log(`🧹 [RedisService] Invalidated ${keysToDelete.length} keys matching: ${pattern}`);
      }
      return keysToDelete.length;
    } catch (err) {
      console.warn(`[RedisService] InvalidatePattern error for ${pattern}:`, err.message);
      return 0;
    }
  }

  /**
   * Idempotency Guard Layer:
   * Atomically checks and sets an idempotency key.
   * Returns:
   *   - true: Lock acquired (this is a new event)
   *   - false: Duplicate event (already processed or currently processing)
   */
  async acquireIdempotencyLock(key, ttlSeconds = 86400) {
    try {
      // SET key 'processing' NX EX ttlSeconds (Atomic in Redis)
      const result = await redis.set(key, 'processing', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err) {
      console.warn(`[RedisService] Idempotency check error on ${key}:`, err.message);
      // Fallback: If Redis is unavailable, allow execution to proceed
      return true;
    }
  }

  /**
   * Mark idempotency key status as 'completed'
   */
  async completeIdempotency(key, ttlSeconds = 86400) {
    try {
      await redis.setex(key, ttlSeconds, 'completed');
    } catch (err) {
      console.warn(`[RedisService] Idempotency complete error on ${key}:`, err.message);
    }
  }

  /**
   * Release idempotency lock (e.g. when an operation fails and allows a retry)
   */
  async releaseIdempotencyLock(key) {
    try {
      await redis.del(key);
    } catch (err) {
      console.warn(`[RedisService] Idempotency release error on ${key}:`, err.message);
    }
  }

  /**
   * Increment a real-time counter atomically (e.g. today's order count)
   */
  async incrementCounter(key, amount = 1, ttlSeconds = 86400) {
    try {
      const val = await redis.incrbyfloat(key, amount);
      // Set expiration if key is newly created
      await redis.expire(key, ttlSeconds);
      return val;
    } catch (err) {
      console.warn(`[RedisService] incrementCounter error on ${key}:`, err.message);
      return null;
    }
  }

  /**
   * Get value of a counter or return default 0
   */
  async getCounter(key) {
    try {
      const val = await redis.get(key);
      return val ? parseFloat(val) : 0;
    } catch (err) {
      console.warn(`[RedisService] getCounter error on ${key}:`, err.message);
      return 0;
    }
  }
}

module.exports = new RedisService();
