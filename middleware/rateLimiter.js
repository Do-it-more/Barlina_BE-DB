/**
 * Admin Rate Limiter — Tier 2 Upgrade
 * 
 * Uses Redis-backed sliding window when available (cluster-safe),
 * falls back to in-memory Map for single-process mode.
 * 
 * Configuration: 200 requests per 15 minutes for Admin routes
 */

const cache = require('../services/cacheService');

// Configuration
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 200;          // Tier 1: Increased from 100 to 200

const adminRateLimiter = async (req, res, next) => {
    // Skip for development
    if (process.env.NODE_ENV === 'development') {
        return next();
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const key = `ratelimit:admin:${ip}`;

    try {
        // Try Redis-backed rate limiting (cluster-safe)
        if (cache.isRedisAvailable()) {
            const redisClient = cache.getRedisClient();
            const current = await redisClient.incr(key);

            if (current === 1) {
                // First request — set TTL
                await redisClient.expire(key, Math.ceil(WINDOW_MS / 1000));
            }

            if (current > MAX_REQUESTS) {
                console.warn(`[Security] Rate limit exceeded for IP: ${ip} on Admin Route: ${req.originalUrl}`);
                return res.status(429).json({
                    message: 'Too many requests from this IP, please try again after 15 minutes.'
                });
            }

            // Set rate limit headers
            res.set('X-RateLimit-Limit', MAX_REQUESTS);
            res.set('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - current));

            return next();
        }
    } catch (err) {
        // Redis failed — fall through to in-memory
    }

    // Fallback: In-memory rate limiting (single process only)
    inMemoryRateLimit(req, res, next, ip);
};

// ==================== IN-MEMORY FALLBACK ====================
const rateLimit = new Map();

const inMemoryRateLimit = (req, res, next, ip) => {
    const now = Date.now();

    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, { count: 1, startTime: now });
    } else {
        const userData = rateLimit.get(ip);

        if (now - userData.startTime > WINDOW_MS) {
            userData.count = 1;
            userData.startTime = now;
        } else {
            userData.count++;

            if (userData.count > MAX_REQUESTS) {
                console.warn(`[Security] Rate limit exceeded for IP: ${ip} on Admin Route: ${req.originalUrl}`);
                return res.status(429).json({
                    message: 'Too many requests from this IP, please try again after 15 minutes.'
                });
            }
        }
    }

    // Clean up old entries periodically
    if (rateLimit.size > 5000) {
        rateLimit.clear();
    }

    next();
};

module.exports = adminRateLimiter;
