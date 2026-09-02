/**
 * middleware/cache.js — Redis HTTP Response Caching Middleware
 * ─────────────────────────────────────────────────────────────
 * Transparently caches GET JSON responses per user/shop in Redis.
 */

const redisService = require('../services/redisService');

/**
 * Express cache middleware factory
 * @param {number} ttlSeconds - Time-to-live for cached response (default: 300)
 */
const cacheMiddleware = (ttlSeconds = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Bypass cache if client explicitly requested no-cache
    if (
      req.headers['cache-control'] === 'no-cache' ||
      req.headers['pragma'] === 'no-cache'
    ) {
      res.setHeader('X-Cache', 'BYPASS');
      return next();
    }

    const shopId = req.user?._id || 'public';
    const cacheKey = `cache:http:${shopId}:${req.originalUrl}`;

    try {
      const cachedData = await redisService.get(cacheKey);
      if (cachedData) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(cachedData);
      }

      res.setHeader('X-Cache', 'MISS');

      // Intercept res.json to capture and store the payload in Redis
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Only cache successful 200 responses
        if (res.statusCode === 200 && body && body.success !== false) {
          redisService.set(cacheKey, body, ttlSeconds).catch(() => {});
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      // Fallback: If Redis cache check fails, continue without caching
      next();
    }
  };
};

module.exports = cacheMiddleware;
