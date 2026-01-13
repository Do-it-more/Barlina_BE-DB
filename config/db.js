const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        console.log('⏳ Connecting to MongoDB Atlas...');
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
