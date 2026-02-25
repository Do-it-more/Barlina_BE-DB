/**
 * Unified Caching Service
 * Layer 1: In-Memory (node-cache) — always available, sub-ms latency
 * Layer 2: Redis (optional) — shared across cluster workers
 * 
 * Falls back gracefully to in-memory only if Redis is unavailable.
 */

const NodeCache = require('node-cache');

// ==================== IN-MEMORY CACHE ====================
// stdTTL: default TTL in seconds (5 minutes)
// checkperiod: cleanup interval (60 seconds)
// maxKeys: prevent memory bloat (10,000 keys max)
const memoryCache = new NodeCache({
    stdTTL: 300,
    checkperiod: 60,
    maxKeys: 10000,
    useClones: false // Better performance, but be careful with mutations
});

// ==================== REDIS CACHE (Optional) ====================
let redisClient = null;
let redisAvailable = false;

const initRedis = async () => {
    if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
        console.log('[Cache] Redis not configured, using in-memory cache only');
        return false;
    }

    try {
        const Redis = require('ioredis');

        if (process.env.REDIS_URL) {
            redisClient = new Redis(process.env.REDIS_URL, {
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true,
                enableReadyCheck: true,
                connectTimeout: 5000,
            });
        } else {
            redisClient = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true,
                enableReadyCheck: true,
                connectTimeout: 5000,
            });
        }

        await redisClient.connect();
        redisAvailable = true;
        console.log('[Cache] ✅ Redis connected — dual-layer caching active');

        redisClient.on('error', (err) => {
            console.error('[Cache] Redis error:', err.message);
            redisAvailable = false;
        });

        redisClient.on('reconnecting', () => {
            console.log('[Cache] Redis reconnecting...');
        });

        redisClient.on('ready', () => {
            redisAvailable = true;
            console.log('[Cache] Redis ready');
        });

        return true;
    } catch (error) {
        console.warn('[Cache] Redis connection failed, using in-memory only:', error.message);
        redisAvailable = false;
        return false;
    }
};

// ==================== CACHE OPERATIONS ====================

/**
 * Get value from cache (checks memory first, then Redis)
 * @param {string} key - Cache key
 * @returns {*} Cached value or null
 */
const get = async (key) => {
    // Layer 1: Check in-memory cache first (fastest)
    const memValue = memoryCache.get(key);
    if (memValue !== undefined) {
        return memValue;
    }

    // Layer 2: Check Redis if available
    if (redisAvailable && redisClient) {
        try {
            const redisValue = await redisClient.get(`cache:${key}`);
            if (redisValue) {
                const parsed = JSON.parse(redisValue);
                // Backfill memory cache for future fast access
                memoryCache.set(key, parsed);
                return parsed;
            }
        } catch (err) {
            console.error('[Cache] Redis GET error:', err.message);
        }
    }

    return null;
};

/**
 * Set value in both cache layers
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 * @param {number} ttl - TTL in seconds (default: 300 = 5 min)
 */
const set = async (key, value, ttl = 300) => {
    // Layer 1: Always set in memory
    memoryCache.set(key, value, ttl);

    // Layer 2: Set in Redis if available (for cross-worker sharing)
    if (redisAvailable && redisClient) {
        try {
            await redisClient.setex(`cache:${key}`, ttl, JSON.stringify(value));
        } catch (err) {
            console.error('[Cache] Redis SET error:', err.message);
        }
    }
};

/**
 * Delete a specific key from both layers
 * @param {string} key - Cache key to delete
 */
const del = async (key) => {
    memoryCache.del(key);

    if (redisAvailable && redisClient) {
        try {
            await redisClient.del(`cache:${key}`);
        } catch (err) {
            console.error('[Cache] Redis DEL error:', err.message);
        }
    }
};

/**
 * Delete all keys matching a pattern
 * @param {string} pattern - Pattern to match (e.g., 'products:*')
 */
const delPattern = async (pattern) => {
    // Memory cache: find and delete matching keys
    const allKeys = memoryCache.keys();
    const regex = new RegExp('^' + pattern.replace('*', '.*'));
    const matchingKeys = allKeys.filter(key => regex.test(key));
    matchingKeys.forEach(key => memoryCache.del(key));

    // Redis: use SCAN for safe pattern deletion
    if (redisAvailable && redisClient) {
        try {
            let cursor = '0';
            do {
                const [newCursor, keys] = await redisClient.scan(
                    cursor, 'MATCH', `cache:${pattern}`, 'COUNT', 100
                );
                cursor = newCursor;
                if (keys.length > 0) {
                    await redisClient.del(...keys);
                }
            } while (cursor !== '0');
        } catch (err) {
            console.error('[Cache] Redis pattern DEL error:', err.message);
        }
    }
};

/**
 * Flush all caches
 */
const flush = async () => {
    memoryCache.flushAll();
    if (redisAvailable && redisClient) {
        try {
            // Only flush our cache keys, not all Redis data
            await delPattern('*');
        } catch (err) {
            console.error('[Cache] Redis flush error:', err.message);
        }
    }
};

/**
 * Get cache statistics
 */
const getStats = () => {
    const memStats = memoryCache.getStats();
    return {
        memoryCache: {
            keys: memoryCache.keys().length,
            hits: memStats.hits,
            misses: memStats.misses,
            hitRate: memStats.hits + memStats.misses > 0
                ? ((memStats.hits / (memStats.hits + memStats.misses)) * 100).toFixed(2) + '%'
                : '0%'
        },
        redisAvailable,
    };
};

/**
 * Cache-aside pattern helper
 * Checks cache first, if miss, calls fetchFn and caches result
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Async function to call on cache miss
 * @param {number} ttl - TTL in seconds
 * @returns {*} Cached or freshly fetched value
 */
const getOrSet = async (key, fetchFn, ttl = 300) => {
    const cached = await get(key);
    if (cached !== null) {
        return cached;
    }

    const freshValue = await fetchFn();
    await set(key, freshValue, ttl);
    return freshValue;
};

/**
 * Graceful shutdown
 */
const close = async () => {
    memoryCache.close();
    if (redisClient) {
        try {
            await redisClient.quit();
        } catch (err) {
            // Ignore close errors
        }
    }
    console.log('[Cache] Cache service closed');
};

// ==================== PREDEFINED CACHE KEYS ====================
const KEYS = {
    SETTINGS: 'global:settings',
    CATEGORIES: 'global:categories',
    TOP_PRODUCTS: 'products:top',
    PRODUCT_LIST: (page, category, keyword) => `products:list:${page}:${category || 'all'}:${keyword || 'none'}`,
    PRODUCT_DETAIL: (id) => `products:detail:${id}`,
    DASHBOARD_STATS: 'admin:dashboard:stats',
};

module.exports = {
    initRedis,
    get,
    set,
    del,
    delPattern,
    flush,
    getStats,
    getOrSet,
    close,
    KEYS,
    // Expose for direct access if needed
    memoryCache,
    getRedisClient: () => redisClient,
    isRedisAvailable: () => redisAvailable,
};
