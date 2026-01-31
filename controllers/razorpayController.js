const Razorpay = require('razorpay');
const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const Setting = require('../models/Setting');
const Order = require('../models/Order');

// Helper to get Razorpay Instance
const getRazorpayInstance = async () => {
    const settings = await Setting.findOne();
    const config = settings?.paymentGateways?.razorpay;

    // Fallback to env variables if not in settings
    const keyId = config?.keyId || process.env.RAZORPAY_KEY_ID;
    const keySecret = config?.keySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials not found');
    }

    return new Razorpay({
        key_id: keyId,
        key_secret: keySecret
    });
};

// @desc    Create Razorpay Order
// @route   POST /api/payments/razorpay/create-order
// @access  Private
const createRazorpayOrder = async (req, res) => {
    try {
        const { orderId, amount, currency = 'INR', receipt } = req.body;

        const instance = await getRazorpayInstance();

        const options = {
            amount: Math.round(amount * 100), // amount in lowest denomination (paise)
            currency,
            receipt: receipt || `receipt_${Date.now()}`,
            notes: {
                orderId: orderId // Internal Order ID
            }
        };

        const order = await instance.orders.create(options);

        // Retrieve keyId to send back to frontend
        const settings = await Setting.findOne();
        const keyId = settings?.paymentGateways?.razorpay?.keyId || process.env.RAZORPAY_KEY_ID;

        res.json({
            success: true,
            orderId: order.id, // Razorpay Order ID (e.g. order_IluGWZB)
            currency: order.currency,
            amount: order.amount,
            keyId: keyId, // Frontend needs this to open checkout
            gateway: 'razorpay'
        });

    } catch (error) {
        console.error('Razorpay Create Order Error:', error);
        res.status(500).json({
            message: 'Failed to create Razorpay order',
            error: error.message
        });
    }
};

// @desc    Verify Razorpay Payment
// @route   POST /api/payments/razorpay/verify
// @access  Private
const verifyRazorpayPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const settings = await Setting.findOne();
        const keySecret = settings?.paymentGateways?.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET;

        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac('sha256', keySecret)
            .update(body.toString())
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            // Payment verified successfully
            res.json({
                success: true,
                message: 'Payment verified successfully',
                paymentId: razorpay_payment_id,
                orderId: razorpay_order_id
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Invalid signature'
            });
        }

    } catch (error) {
        console.error('Razorpay Verify Error:', error);
        res.status(500).json({
            message: 'Payment verification failed',
            error: error.message
        });
    }
};

module.exports = {
    createRazorpayOrder,
    verifyRazorpayPayment
};
