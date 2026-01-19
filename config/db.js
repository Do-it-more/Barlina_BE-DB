const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 30000, // Increased to 30s
            socketTimeoutMS: 45000,
            maxPoolSize: 10
        });

        console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);

        mongoose.connection.on('error', err => {
            console.error(`❌ MongoDB Runtime Error: ${err}`);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB Disconnected. Mongoose will attempt to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB Reconnected');
        });

    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        console.log('🔄 Connection failed. Retrying in 5 seconds...');
        // Wait 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Retry recursively
        await connectDB();
    }
};

module.exports = connectDB;
