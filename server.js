const express = require('express');
const dotenv = require('dotenv');
// Load env vars FIRST
dotenv.config();

const compression = require('compression');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { initializeFirebaseAdmin } = require('./config/firebaseAdmin');

// Initialize Firebase
initializeFirebaseAdmin();

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: [process.env.CLIENT_URL || "http://localhost:5173", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Socket.io Logic
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join_admin_chat', (userData) => {
        socket.join('admin_chat');
        console.log(`${userData.name} joined admin chat`);
        socket.to('admin_chat').emit('user_joined', userData);
    });

    socket.on('send_message', (messageData) => {
        // Broadcast to everyone in 'admin_chat' including sender (or managing via frontend state)
        // Actually, usually we broadcast to others and let sender use local state, 
        // OR simply emit to room.
        io.to('admin_chat').emit('receive_message', messageData);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});


// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/users', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
// Rename original chatRoutes to something else if needed, or keep for chatbot
// Using /api/admin/chat for internal chat
app.use('/api/admin/chat', require('./routes/adminChatRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));

app.use('/api/complaints', require('./routes/complaintRoutes'));
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/admin/management', require('./routes/adminManagementRoutes'));
app.use('/api/test-email', require('./routes/testEmailRoute'));
app.use('/api/returns', require('./routes/returnRoutes'));
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
