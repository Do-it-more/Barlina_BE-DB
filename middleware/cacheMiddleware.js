/**
 * HTTP Response Caching Middleware
 * Caches entire API responses for GET requests
 * Dramatically reduces DB load for frequently accessed endpoints
 */

const cache = require('../services/cacheService');

/**
 * Creates a caching middleware for a specific route
 * @param {number} ttl - Cache TTL in seconds (default: 120 = 2 min)
 * @param {Function} keyGenerator - Optional custom key generator (req) => string
 * @returns {Function} Express middleware
 */
const cacheMiddleware = (ttl = 120, keyGenerator = null) => {
    return async (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        // Generate cache key
        const cacheKey = keyGenerator
            ? keyGenerator(req)
            : `response:${req.originalUrl}`;

        try {
            // Check cache
            const cachedResponse = await cache.get(cacheKey);

            if (cachedResponse) {
                // Set cache header for debugging
                res.set('X-Cache', 'HIT');
                res.set('X-Cache-TTL', ttl.toString());
                return res.json(cachedResponse);
            }

            // Cache MISS — intercept res.json to cache the response
            res.set('X-Cache', 'MISS');
            const originalJson = res.json.bind(res);

            res.json = (data) => {
                // Only cache successful responses
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    cache.set(cacheKey, data, ttl).catch(() => { });
                }
                return originalJson(data);
            };

            next();
        } catch (error) {
            // On cache error, just proceed without caching
            console.error('[CacheMiddleware] Error:', error.message);
            next();
        }
    };
};

/**
 * Middleware to invalidate cache for specific patterns after mutations
 * Use this on POST/PUT/DELETE routes
 * @param  {...string} patterns - Cache key patterns to invalidate
 * @returns {Function} Express middleware
 */
const invalidateCache = (...patterns) => {
    return async (req, res, next) => {
        // Intercept res.json to invalidate AFTER successful mutation
        const originalJson = res.json.bind(res);

        res.json = async (data) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                for (const pattern of patterns) {
                    await cache.delPattern(pattern).catch(() => { });
                }
            }
            return originalJson(data);
        };

        next();
    };
};

module.exports = { cacheMiddleware, invalidateCache };
