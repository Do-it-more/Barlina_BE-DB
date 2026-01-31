require('dotenv').config();
const mongoose = require('mongoose');
const Setting = require('./models/Setting');
const Razorpay = require('razorpay');

const verifyKeys = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const settings = await Setting.findOne();
        const config = settings?.paymentGateways?.razorpay;

        console.log('--- Razorpay Config Check ---');
        console.log('Key ID form DB:', config?.keyId);
        console.log('Key Secret from DB exists:', !!config?.keySecret);

        if (!config?.keyId || !config?.keySecret) {
            console.error('❌ Missing keys in DB');
            process.exit(1);
        }

        const instance = new Razorpay({
            key_id: config.keyId,
            key_secret: config.keySecret
        });

        console.log('Attempting to fetch orders to verify keys...');
        const orders = await instance.orders.all({ count: 1 });
        console.log('✅ Keys are VALID! Connection successful.');
        console.log('Sample Order ID:', orders.items[0]?.id);

    } catch (error) {
        console.error('❌ Verification Failed:', error);
    } finally {
        mongoose.disconnect();
    }
};

verifyKeys();
