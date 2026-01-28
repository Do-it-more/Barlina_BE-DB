const express = require('express');
const dotenv = require('dotenv');
// Load env vars FIRST
dotenv.config();

const compression = require('compression');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

// ... (Firebase init)

const app = express();
// Security Middleware
// app.use(helmet()); // Set security headers
// app.use(mongoSanitize()); // Prevent NoSQL injection
// app.use(xss()); // REMOVED: Breaks login by sanitizing passwords
// app.use(hpp()); // Prevent HTTP Param Pollution

const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: [process.env.CLIENT_URL || "http://localhost:5173", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

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
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Make io accessible to our routers
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Static files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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
app.use('/api/test-email', require('./routes/testEmailRoute'));
app.use('/api/returns', require('./routes/returnRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes')); // Cashfree Payment Gateway
app.use('/api/finance', require('./routes/financialRoutes')); // Financial Department Records
app.use('/api/admin/audit-logs', require('./routes/auditLogRoutes')); // Audit Logs (Super Admin)
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

    server.listen(PORT, () => {
        console.log(
            `🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`
        );
    });
};

startServer();

module.exports = app;
