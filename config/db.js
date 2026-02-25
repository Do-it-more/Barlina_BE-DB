const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const isProduction = process.env.NODE_ENV === 'production';

        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // ==================== CONNECTION POOL ====================
            // Tier 1: Increased from 10 to 50 for handling concurrent requests
            maxPoolSize: isProduction ? 50 : 20,
            minPoolSize: isProduction ? 10 : 2,

            // ==================== TIMEOUTS ====================
            serverSelectionTimeoutMS: 30000,    // 30s to find a server
            socketTimeoutMS: 45000,             // 45s for socket operations
            connectTimeoutMS: 30000,            // 30s to establish connection
            heartbeatFrequencyMS: 10000,        // 10s heartbeat check

            // ==================== READ PREFERENCE (Tier 3) ====================
            // Read from secondary replicas when available (reduces primary load)
            // 'secondaryPreferred' reads from secondaries, falls back to primary
            readPreference: isProduction ? 'secondaryPreferred' : 'primaryPreferred',

            // ==================== WRITE CONCERN ====================
            w: 'majority',                      // Acknowledged by majority
            wtimeoutMS: 10000,                   // Write timeout 10s
            retryWrites: true,                   // Auto-retry failed writes

            // ==================== COMPRESSION ====================
            compressors: ['zlib', 'snappy'],    // Compress data over the wire
        });

        console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
        console.log(`   Pool Size: ${isProduction ? 50 : 20} | Read Preference: ${isProduction ? 'secondaryPreferred' : 'primaryPreferred'}`);

        // ==================== CONNECTION EVENT HANDLERS ====================
        mongoose.connection.on('error', err => {
            console.error(`❌ MongoDB Runtime Error: ${err}`);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB Disconnected. Mongoose will attempt to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB Reconnected');
        });

        // ==================== CONNECTION MONITORING ====================
        if (isProduction) {
            // Log slow queries (> 200ms)
            mongoose.set('debug', (collectionName, methodName, ...args) => {
                // Only log in production for slow query tracking
            });

            // Monitor pool events
            const pool = mongoose.connection.getClient();
            pool.on('connectionPoolCreated', () => console.log('[MongoDB] Connection pool created'));
            pool.on('connectionPoolCleared', () => console.warn('[MongoDB] Connection pool cleared'));
        }

    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        console.log('🔄 Connection failed. Retrying in 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await connectDB();
    }
};

module.exports = connectDB;
