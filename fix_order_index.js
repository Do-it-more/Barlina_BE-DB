const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const fixIndex = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('orders');

        console.log('Dropping invoiceNumber_1 index...');
        try {
            await collection.dropIndex('invoiceNumber_1');
            console.log('Index dropped successfully');
        } catch (err) {
            console.log('Index might not exist or already dropped:', err.message);
        }

        console.log('Creating sparse unique index for invoiceNumber...');
        await collection.createIndex({ invoiceNumber: 1 }, { unique: true, sparse: true });
        console.log('New sparse unique index created');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

fixIndex();
