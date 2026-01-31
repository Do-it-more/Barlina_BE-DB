const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Define minimal Order schema to avoid loading full model with middleware/hooks that might fail
const orderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.model('Order', orderSchema);

const deleteOrder = async (orderId) => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        const result = await Order.deleteOne({ _id: orderId });

        if (result.deletedCount === 1) {
            console.log(`✅ Successfully deleted order with ID: ${orderId}`);
        } else {
            console.log(`❌ Order not found with ID: ${orderId}`);
        }

        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const id = process.argv[2];
if (!id) {
    console.log('⚠️  Please provide an order ID');
    console.log('Usage: node manual_delete_order.js <ORDER_ID>');
    process.exit(1);
}

deleteOrder(id);
