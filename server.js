const express = require('express');
const dotenv = require('dotenv');
// Load env vars FIRST
dotenv.config();

const compression = require('compression');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const helmet = require('helmet');
// Note: express-mongo-sanitize is incompatible with Express 5 (read-only req.query)
// Using custom sanitization middleware instead
const xss = require('xss-clean');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const scheduleAbandonedCartEmails = require('./cron/abandonedCartScheduler');

// ==================== TIER 2: CACHE SERVICE ====================
const cache = require('./services/cacheService');

// ==================== TIER 2: GRACEFUL SHUTDOWN ====================
const gracefulShutdown = require('./utils/gracefulShutdown');
gracefulShutdown.init();

// ... (Firebase init)

const app = express();

// ==================== SECURITY MIDDLEWARE (ENABLED) ====================

// Set security HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", "https://sdk.cashfree.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://api.razorpay.com", "https://api.cashfree.com", "wss:"],
            frameSrc: ["'self'", "https://api.razorpay.com", "https://sdk.cashfree.com"],
        }
    },
    crossOriginEmbedderPolicy: false // Allow payment gateway iframes
}));

// Custom NoSQL Injection Prevention (Express 5 compatible)
// express-mongo-sanitize doesn't work with Express 5's read-only req.query
const sanitizeValue = (value) => {
    if (typeof value === 'string') {
        // Remove $ and . at the start of keys (NoSQL injection patterns)
        return value.replace(/^\$/, '_').replace(/\./g, '_');
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (value && typeof value === 'object') {
        const sanitized = {};
        for (const key of Object.keys(value)) {
            // Block keys starting with $ (MongoDB operators)
            const safeKey = key.startsWith('$') ? '_' + key.slice(1) : key;
            sanitized[safeKey] = sanitizeValue(value[key]);
        }
        return sanitized;
    }
    return value;
};

app.use((req, res, next) => {
    // Sanitize body (mutable)
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeValue(req.body);
    }
    // Note: req.query and req.params are read-only in Express 5
    // We can't modify them, but we validate on use in controllers
    next();
});

// Prevent HTTP Parameter Pollution
app.use(hpp({
    whitelist: ['sort', 'fields', 'page', 'limit', 'category', 'price'] // Allow these to be arrays
}));


// ==================== RATE LIMITING ====================

// Strict rate limiting for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false
});

// General API rate limiter — Tier 1: Increased capacity
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 200, // Increased from 100 to 200 requests per minute
    message: { message: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Coupon validation rate limiter (prevent brute force)
const couponLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // 10 attempts per minute
    message: { message: 'Too many coupon attempts. Please wait.' }
});


const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: [process.env.CLIENT_URL || "http://localhost:5173", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    },
    // ==================== TIER 3: SOCKET.IO SCALING ====================
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'], // Prefer WebSocket
    allowUpgrades: true,
});

// ==================== TIER 3: SOCKET.IO REDIS ADAPTER ====================
const setupSocketAdapter = async () => {
    if (process.env.REDIS_HOST || process.env.REDIS_URL) {
        try {
            const { createAdapter } = require('@socket.io/redis-adapter');
            const Redis = require('ioredis');

            const pubClient = process.env.REDIS_URL
                ? new Redis(process.env.REDIS_URL)
                : new Redis({
                    host: process.env.REDIS_HOST,
                    port: parseInt(process.env.REDIS_PORT) || 6379,
                    password: process.env.REDIS_PASSWORD || undefined,
                    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
                });
            const subClient = pubClient.duplicate();

            io.adapter(createAdapter(pubClient, subClient));
            console.log('[Socket.io] ✅ Redis adapter enabled — multi-server WebSockets ready');
        } catch (error) {
            console.warn('[Socket.io] Redis adapter not available, using default (single-server):', error.message);
        }
    }
};

// Socket.io Logic
const User = require('./models/User');

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // --- Admin Chat Socket Logic ---
    socket.on('setup_admin_socket', async (userData) => {
        const userId = userData.id || userData._id;
        if (userId) {
            // Save userId on socket immediately for disconnect handler
            socket.userId = userId;

            socket.join(userId.toString());
            socket.join('admin_global'); // Global Admin Room for broadcasting
            console.log(`[Socket] User ${userData.name} connected via setup_admin_socket`);

            // Update database: Set user as online
            try {
                await User.findByIdAndUpdate(userId, { isOnline: true });
                console.log(`[Socket] User ${userData.name} marked as online in DB`);

                // Broadcast Online Status to all admins AFTER DB update
                socket.to('admin_global').emit('user_status', { userId: userId.toString(), isOnline: true });

                // Confirm to the client
                socket.emit('connected');
            } catch (err) {
                console.error('[Socket] Failed to update online status:', err);
                socket.emit('connected'); // Still confirm connection even if DB fails
            }
        }
    });

    socket.on('join_chat_room', (room) => {
        socket.join(room);
        console.log(`[Socket] User joined Room: ${room}`);
    });

    socket.on('leave_chat_room', (room) => {
        socket.leave(room);
        console.log(`[Socket] User left Room: ${room}`);
    });

    socket.on('typing', ({ room, user }) => {
        if (!room) return;
        // Broadcast to the specific room, not global
        socket.to(room).emit('typing', { room, user });
    });

    socket.on('stop_typing', ({ room }) => {
        if (!room) return;
        socket.to(room).emit('stop_typing', { room });
    });

    socket.on('disconnect', async () => {
        console.log('Client disconnected:', socket.id);
        if (socket.userId) {
            const userIdStr = socket.userId.toString();
            // Update database: Set user as offline
            try {
                await User.findByIdAndUpdate(socket.userId, {
                    isOnline: false,
                    lastSeen: new Date()
                });
                console.log(`[Socket] User ${userIdStr} marked as offline in DB`);
            } catch (err) {
                console.error('[Socket] Failed to update offline status:', err);
            }
            socket.to('admin_global').emit('user_status', { userId: userIdStr, isOnline: false });
        }
    });
});


// Middleware
app.use(compression({
    // ==================== TIER 1: BETTER COMPRESSION ====================
    level: 6,
    threshold: 1024,        // Only compress responses > 1KB
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Make io accessible to our routers
app.use((req, res, next) => {
    req.io = io;
    next();
});

// ==================== TIER 2: STATIC FILE SERVING (CDN-READY) ====================
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '7d',               // Browser cache for 7 days
    etag: true,                 // Enable ETags for conditional requests
    lastModified: true,
    immutable: false,
    setHeaders: (res) => {
        res.set('Cache-Control', 'public, max-age=604800');
        res.set('X-Content-Type-Options', 'nosniff');
    }
}));

// ==================== TIER 2: HEALTH CHECK ENDPOINT ====================
app.get('/health', async (req, res) => {
    const mongoose = require('mongoose');
    const cacheStats = cache.getStats();

    const healthCheck = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()) + 's',
        pid: process.pid,
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        },
        database: {
            status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            host: mongoose.connection.host || 'N/A',
        },
        cache: cacheStats,
        connections: {
            sockets: io.engine?.clientsCount || 0,
        },
    };

    const isHealthy = mongoose.connection.readyState === 1;
    res.status(isHealthy ? 200 : 503).json(healthCheck);
});

// Cache stats endpoint (admin only — no auth for simplicity in monitoring)
app.get('/api/cache/stats', (req, res) => {
    res.json(cache.getStats());
});

// Routes
const adminRateLimiter = require('./middleware/rateLimiter');

// Apply rate limiting to admin management routes
app.use('/api/admin', adminRateLimiter);

app.use('/api/users', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
// Using /api/admin/chat for internal chat
app.use('/api/admin/chat', require('./routes/adminChatRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));

app.use('/api/complaints', require('./routes/complaintRoutes'));
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/sellers', require('./routes/sellerRoutes'));
app.use('/api/admin/management', require('./routes/adminManagementRoutes'));
app.use('/api/admin/sellers', require('./routes/sellerAdminRoutes')); // Admin Seller Management
app.use('/api/admin/product-reviews', require('./routes/productReviewRoutes')); // Product Review System
app.use('/api/admin/support-tickets', require('./routes/adminSupportRoutes')); // Admin Support System
app.use('/api/test-email', require('./routes/testEmailRoute'));
app.use('/api/returns', require('./routes/returnRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes')); // Cashfree Payment Gateway
app.use('/api/finance', require('./routes/financialRoutes')); // Financial Department Records
app.use('/api/admin/audit-logs', require('./routes/auditLogRoutes')); // Audit Logs (Super Admin)
app.use('/api/notifications', require('./routes/notificationRoutes')); // User Notifications
app.use('/api/wallet', require('./routes/walletRoutes')); // Wallet System
app.use('/api/settlements', require('./routes/settlementRoutes')); // Seller Settlements & Payouts

// Apply auth rate limiter to specific routes
app.use('/api/users/login', authLimiter);
app.use('/api/users/register', authLimiter);
app.use('/api/users/forgot-password', authLimiter);

// Apply coupon rate limiter
app.use('/api/coupons/validate', couponLimiter);

app.get('/', (req, res) => {
    res.send('API is running...');
});


const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// ... (other imports)

// (At the bottom of the file, replace the inline handler)
app.use(notFound);
app.use(errorHandler);

// Start server ONLY after DB connects
const PORT = process.env.PORT || 5001;

const startServer = async () => {
    await connectDB(); // ⬅️ if this fails, server will NOT start

    // ==================== TIER 2: INITIALIZE CACHE ====================
    await cache.initRedis();

    // ==================== TIER 3: SOCKET.IO REDIS ADAPTER ====================
    await setupSocketAdapter();

    // Start Cron Jobs
    scheduleAbandonedCartEmails();

    // Start Settlement Cron Jobs
    try {
        const { scheduleSettlementJobs } = require('./cron/settlementScheduler');
        scheduleSettlementJobs();
    } catch (err) {
        console.warn('[Server] Settlement scheduler not available:', err.message);
    }

    // Start Automated Finance Jobs (Weekly settlements, fraud detection, etc.)
    try {
        const { scheduleAutomatedFinanceJobs } = require('./cron/automatedFinanceJobs');
        scheduleAutomatedFinanceJobs();
    } catch (err) {
        console.warn('[Server] Automated finance jobs not available:', err.message);
    }

    // Start Seller Performance Tracking Jobs
    try {
        const { schedulePerformanceJobs } = require('./cron/performanceTracking');
        schedulePerformanceJobs();
    } catch (err) {
        console.warn('[Server] Performance tracking not available:', err.message);
    }

    // Register server for graceful shutdown
    gracefulShutdown.registerServer(server, io);

    server.listen(PORT, () => {
        console.log(
            `🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`
        );
        console.log(`📅 Automated jobs: Settlements, Fraud Detection, Performance Reviews`);
        console.log(`💊 Health check: http://localhost:${PORT}/health`);
        console.log(`📊 Cache stats:  http://localhost:${PORT}/api/cache/stats`);

        // Signal PM2 that the app is ready
        if (process.send) {
            process.send('ready');
        }
    });
};



startServer();

module.exports = app;
