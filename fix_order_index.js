const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const fixIndexes = async () => {
    await connectDB();

    try {
        const collection = mongoose.connection.collection('orders');
        const indexes = await collection.indexes();
        console.log("Current Indexes:", indexes);

        try {
            await collection.dropIndex('invoiceNumber_1');
            console.log("SUCCESS: Dropped 'invoiceNumber_1' index.");
        } catch (err) {
            console.log("Index 'invoiceNumber_1' not found or already dropped:", err.message);
        }

        console.log("Process complete.");
        process.exit();
    } catch (error) {
        console.error("Error managing indexes:", error);
        process.exit(1);
    }
};

fixIndexes();
