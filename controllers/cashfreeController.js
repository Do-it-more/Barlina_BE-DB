const Order = require('../models/Order');
const Setting = require('../models/Setting');
const axios = require('axios');

// Helper to get Cashfree Config
const getCashfreeConfig = async () => {
    const settings = await Setting.findOne();
    const config = settings?.paymentGateways?.cashfree;

    // Fallback to env if not in DB (backward compatibility)
    if (!config || !config.appId) {
        if (process.env.CASHFREE_APP_ID) {
            return {
                appId: process.env.CASHFREE_APP_ID,
                secretKey: process.env.CASHFREE_SECRET_KEY,
                isProduction: process.env.NODE_ENV === 'production',
                baseUrl: process.env.NODE_ENV === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg'
            }
        }
        throw new Error('Cashfree configuration missing');
    }

    return {
        appId: config.appId,
        secretKey: config.secretKey,
        isProduction: config.isProduction,
        baseUrl: config.isProduction ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg'
    };
};

// @desc    Create Cashfree order/session
// @route   POST /api/payments/cashfree/create-order
// @access  Private
const createCashfreeOrder = async (req, res) => {
    try {
        const { orderId, amount, customerDetails } = req.body;
        const config = await getCashfreeConfig();

        if (!orderId || !amount || !customerDetails) {
            return res.status(400).json({ message: 'Missing required fields' });
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
                return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/order-confirmation?order_id={order_id}&gateway=cashfree`,
                notify_url: `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/payments/cashfree/webhook`
            }
        };

        const response = await axios.post(`${config.baseUrl}/orders`, request, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-version': '2023-08-01',
                'x-client-id': config.appId,
                'x-client-secret': config.secretKey
            }
        });

        res.json({
            success: true,
            orderId: response.data.order_id,
            paymentSessionId: response.data.payment_session_id,
            orderStatus: response.data.order_status,
            gateway: 'cashfree'
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
        const config = await getCashfreeConfig();

        if (!orderId) {
            return res.status(400).json({ message: 'Order ID is required' });
        }

        const response = await axios.get(`${config.baseUrl}/orders/${orderId}/payments`, {
            headers: {
                'x-api-version': '2023-08-01',
                'x-client-id': config.appId,
                'x-client-secret': config.secretKey
            }
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
                        email_address: req.user.email,
                        gateway: 'cashfree'
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
        const crypto = require('crypto');
        const config = await getCashfreeConfig();
        const signature = req.headers['x-webhook-signature'];
        const timestamp = req.headers['x-webhook-timestamp'];

        // IMPORTANT: For proper signature verification, you need raw body
        // This requires express.raw() middleware on this route
        const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', config.secretKey)
            .update(timestamp + rawBody)
            .digest('base64');

        if (signature !== expectedSignature) {
            console.warn('[Cashfree Webhook] Invalid signature');
            return res.status(401).json({ message: 'Invalid signature' });
        }

        const { data, type } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
            const orderId = data.order.order_id;
            const paymentId = data.payment.cf_payment_id;

            // Extract MongoDB order ID from custom order ID
            const mongoOrderId = orderId.replace('ORDER_', '');

            const order = await Order.findById(mongoOrderId);

            // IDEMPOTENCY CHECK - Don't process twice
            if (!order) {
                console.warn(`[Cashfree Webhook] Order not found: ${mongoOrderId}`);
                return res.json({ received: true, message: 'Order not found' });
            }

            if (order.isPaid) {
                console.log(`[Cashfree Webhook] Order ${mongoOrderId} already paid - skipping`);
                return res.json({ received: true, message: 'Already processed' });
            }

            // Generate invoice number
            if (!order.invoiceNumber) {
                const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
                order.invoiceNumber = `INV-${randomStr}`;
            }

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

            console.log(`✅ [Cashfree Webhook] Order ${mongoOrderId} marked as paid`);

            // --- CREATE FINANCIAL RECORD ---
            try {
                const FinancialRecord = require('../models/FinancialRecord');
                await FinancialRecord.create({
                    type: 'INCOME',
                    category: 'Sales',
                    amount: order.totalPrice,
                    description: `Payment via Cashfree: Order #${order.invoiceNumber || order._id}`,
                    date: Date.now(),
                    reference: { model: 'Order', id: order._id },
                    paymentMethod: 'Cashfree',
                    status: 'COMPLETED'
                });
            } catch (err) {
                console.error('[Cashfree Webhook] Failed to create financial record:', err);
            }

            // --- CREATE SELLER LEDGER ENTRIES ---
            try {
                const commissionService = require('../services/commissionService');
                await commissionService.createOrderLedgerEntries(order);
                console.log(`[Cashfree Webhook] Ledger entries created for order ${mongoOrderId}`);
            } catch (err) {
                console.error('[Cashfree Webhook] Failed to create ledger entries:', err);
            }

            // --- QUEUE INVOICE EMAIL (if queue available) ---
            try {
                const queueService = require('../services/queueService');
                if (order.user) {
                    await queueService.queueInvoice(order._id.toString(), order.user.toString());
                }
            } catch (err) {
                // Queue not available - email will be sent on next user interaction
                console.log('[Cashfree Webhook] Queue not available for invoice');
            }
        }

        // Always return 200 quickly to prevent gateway retries
        res.json({ received: true });

    } catch (error) {
        console.error('[Cashfree Webhook] Error:', error);
        // Still return 200 to prevent retries that could cause issues
        res.status(200).json({ received: true, error: 'Processing failed but acknowledged' });
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
