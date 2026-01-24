const Order = require('../models/Order');
const crypto = require('crypto');
const axios = require('axios');

// Cashfree API Base URLs
const CASHFREE_BASE_URL = process.env.NODE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

// Helper to make Cashfree API calls
const cashfreeApi = axios.create({
    baseURL: CASHFREE_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'x-api-version': '2023-08-01'
    }
});

// Add auth headers dynamically
const getCashfreeHeaders = () => ({
    'x-client-id': process.env.CASHFREE_APP_ID,
    'x-client-secret': process.env.CASHFREE_SECRET_KEY
});

// @desc    Create Cashfree order/session
// @route   POST /api/payments/cashfree/create-order
// @access  Private
const createCashfreeOrder = async (req, res) => {
    try {
        const { orderId, amount, customerDetails } = req.body;

        if (!orderId || !amount || !customerDetails) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Check if Cashfree is configured
        if (!process.env.CASHFREE_APP_ID || process.env.CASHFREE_APP_ID === 'YOUR_CASHFREE_APP_ID') {
            return res.status(503).json({
                message: 'Cashfree is not configured yet. Please add your API keys to the backend .env file.',
                instructions: 'Get your keys from https://merchant.cashfree.com → Developers → API Keys'
            });
        }

        const request = {
            order_id: orderId,
            order_amount: amount,
            order_currency: 'INR',
            customer_details: {
                customer_id: customerDetails.customerId || req.user._id.toString(),
                customer_name: customerDetails.name || req.user.name,
                customer_email: customerDetails.email || req.user.email,
                customer_phone: customerDetails.phone || req.user.phoneNumber || '9999999999'
            },
            order_meta: {
                return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/order-confirmation?order_id={order_id}`,
                notify_url: `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/payments/cashfree/webhook`
            }
        };

        const response = await cashfreeApi.post('/orders', request, {
            headers: getCashfreeHeaders()
        });

        res.json({
            success: true,
            orderId: response.data.order_id,
            paymentSessionId: response.data.payment_session_id,
            orderStatus: response.data.order_status
        });

    } catch (error) {
        console.error('Cashfree Create Order Error:', error.response?.data || error.message);
        res.status(500).json({
            message: 'Failed to create payment session',
            error: error.response?.data?.message || error.message
        });
    }
};

// @desc    Verify Cashfree payment
// @route   POST /api/payments/cashfree/verify
// @access  Private
const verifyCashfreePayment = async (req, res) => {
    try {
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ message: 'Order ID is required' });
        }

        const response = await cashfreeApi.get(`/orders/${orderId}/payments`, {
            headers: getCashfreeHeaders()
        });

        const payments = response.data;

        if (payments && payments.length > 0) {
            const successfulPayment = payments.find(p => p.payment_status === 'SUCCESS');

            if (successfulPayment) {
                // Update order in database
                const mongoOrderId = orderId.replace('ORDER_', '');
                const order = await Order.findById(mongoOrderId);

                if (order) {
                    order.isPaid = true;
                    order.paidAt = new Date();
                    order.paymentResult = {
                        id: successfulPayment.cf_payment_id,
                        status: 'SUCCESS',
                        update_time: new Date().toISOString(),
                        email_address: req.user.email
                    };
                    order.status = 'PAID';
                    await order.save();
                }

                return res.json({
                    success: true,
                    verified: true,
                    payment: successfulPayment
                });
            }
        }

        res.json({
            success: true,
            verified: false,
            message: 'Payment not yet confirmed'
        });

    } catch (error) {
        console.error('Cashfree Verify Error:', error.response?.data || error.message);
        res.status(500).json({
            message: 'Failed to verify payment',
            error: error.response?.data?.message || error.message
        });
    }
};

// @desc    Cashfree Webhook Handler
// @route   POST /api/payments/cashfree/webhook
// @access  Public (with signature verification)
const cashfreeWebhook = async (req, res) => {
    try {
        const signature = req.headers['x-webhook-signature'];
        const timestamp = req.headers['x-webhook-timestamp'];
        const rawBody = JSON.stringify(req.body);

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
            .update(timestamp + rawBody)
            .digest('base64');

        if (signature !== expectedSignature) {
            console.warn('Invalid webhook signature');
            return res.status(401).json({ message: 'Invalid signature' });
        }

        const { data, type } = req.body;

        if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
            const orderId = data.order.order_id;
            const paymentId = data.payment.cf_payment_id;

            // Extract MongoDB order ID from custom order ID
            const mongoOrderId = orderId.replace('ORDER_', '');

            const order = await Order.findById(mongoOrderId);

            if (order && !order.isPaid) {
                order.isPaid = true;
                order.paidAt = new Date();
                order.paymentResult = {
                    id: paymentId,
                    status: 'SUCCESS',
                    update_time: new Date().toISOString(),
                    gateway: 'Cashfree'
                };
                order.status = 'PAID';
                await order.save();

                console.log(`✅ Order ${mongoOrderId} marked as paid via webhook`);
            }
        }

        res.json({ received: true });

    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).json({ message: 'Webhook processing failed' });
    }
};

// @desc    Get payment status
// @route   GET /api/payments/cashfree/status/:orderId
// @access  Private
const getPaymentStatus = async (req, res) => {
    try {
        const { orderId } = req.params;

        const response = await cashfreeApi.get(`/orders/${orderId}`, {
            headers: getCashfreeHeaders()
        });

        res.json({
            success: true,
            orderStatus: response.data.order_status,
            orderAmount: response.data.order_amount
        });

    } catch (error) {
        console.error('Get Payment Status Error:', error.response?.data || error.message);
        res.status(500).json({
            message: 'Failed to fetch payment status',
            error: error.response?.data?.message || error.message
        });
    }
};

module.exports = {
    createCashfreeOrder,
    verifyCashfreePayment,
    cashfreeWebhook,
    getPaymentStatus
};
