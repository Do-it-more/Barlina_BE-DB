const rateLimit = new Map();

// Configuration: 100 requests per 15 minutes for Admin routes
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 100;

const adminRateLimiter = (req, res, next) => {
    // Skip for development or specific IPs if needed
    if (process.env.NODE_ENV === 'development') {
        next(); return;
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();

    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, {
            count: 1,
            startTime: now
        });
    } else {
        const userData = rateLimit.get(ip);

        // Reset window if expired
        if (now - userData.startTime > WINDOW_MS) {
            userData.count = 1;
            userData.startTime = now;
        } else {
            userData.count++;

            if (userData.count > MAX_REQUESTS) {
                console.warn(`[Security] Rate limit exceeded for IP: ${ip} on Admin Route: ${req.originalUrl}`);
                return res.status(429).json({
                    message: "Too many requests from this IP, please try again after 15 minutes."
                });
            }
        }
    }

    // Clean up old entries periodically (simple memory management)
    if (rateLimit.size > 5000) {
        // Clear entire cache if it gets too big to prevent memory leaks in this simple implementation
        rateLimit.clear();
    }

    next();
};

module.exports = adminRateLimiter;
