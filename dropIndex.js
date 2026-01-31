require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');

const dropIndex = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB...');

        const collection = mongoose.connection.collection('orders');
        console.log('Dropping invoiceNumber_1 index...');

        try {
            await collection.dropIndex('invoiceNumber_1');
            console.log('✅ Index invoiceNumber_1 dropped successfully!');
        } catch (err) {
            console.log('⚠️  Index might not exist or failed to drop:', err.message);
        }

        // List indexes to verify
        const indexes = await collection.indexes();
        console.log('Current Indexes:', indexes);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        mongoose.disconnect();
    }
};

dropIndex();
