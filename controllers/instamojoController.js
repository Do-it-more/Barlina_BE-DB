const axios = require('axios');
const Order = require('../models/Order');
const Setting = require('../models/Setting');

// Helper to get Instamojo Config
const getInstamojoConfig = async () => {
    const settings = await Setting.findOne();
    const config = settings?.paymentGateways?.instamojo;

    if (!config || !config.apiKey || !config.authToken) {
        throw new Error('Instamojo configuration missing');
    }

    return {
        apiKey: config.apiKey,
        authToken: config.authToken,
        isProduction: config.isProduction,
        baseUrl: config.isProduction ? 'https://api.instamojo.com/api/1.1' : 'https://test.instamojo.com/api/1.1'
    };
};

// @desc    Create Instamojo Payment Request
const createInstamojoOrder = async (req, res) => {
    try {
        const { orderId, amount, customerDetails } = req.body;
        const config = await getInstamojoConfig();

        // Clean phone number (Instamojo is strict)
        const cleanPhone = (customerDetails.phone || '').replace(/\D/g, '').slice(-10);

        const payload = {
            purpose: `Order #${orderId}`,
            amount: Number(amount).toFixed(2),
            buyer_name: customerDetails.name,
            email: customerDetails.email || 'customer@example.com',
            phone: cleanPhone || '9999999999',
            redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/order-confirmation?order_id=${orderId}&gateway=instamojo`,
            send_email: false,
            send_sms: false,
            webhook: `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/payments/instamojo/webhook`,
            allow_repeated_payments: false
        };

        // Instamojo v1.1 strictly requires form-data/urlencoded
        const formParams = new URLSearchParams();
        Object.keys(payload).forEach(key => formParams.append(key, payload[key]));

        console.log(`[Instamojo] Creating payment request in ${config.isProduction ? 'PRODUCTION' : 'SANDBOX'} mode`);

        const response = await axios.post(`${config.baseUrl}/payment-requests/`, formParams, {
            headers: {
                'X-Api-Key': config.apiKey,
                'X-Auth-Token': config.authToken,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        res.json({
            success: true,
            orderId: orderId,
            paymentRequestId: response.data.payment_request.id,
            paymentLink: response.data.payment_request.longurl,
            gateway: 'instamojo'
        });

    } catch (error) {
        console.error('Instamojo Create Order Error:', error.response?.data || error.message);

        let errorMessage = error.message;
        if (error.response?.data) {
            // v1.1 often returns error as an object with 'message' or 'reason'
            const data = error.response.data;
            errorMessage = data.message || JSON.stringify(data);
        }

        res.status(500).json({
            message: 'Failed to create Instamojo payment request',
            error: errorMessage
        });
    }
};

// @desc    Verify Instamojo Payment
const verifyInstamojoPayment = async (req, res) => {
    try {
        const { paymentRequestId, paymentId } = req.body;
        const config = await getInstamojoConfig();

        if (!paymentRequestId || !paymentId) {
            return res.status(400).json({ message: 'Missing payment details' });
        }

        const response = await axios.get(`${config.baseUrl}/payment-requests/${paymentRequestId}/`, {
            headers: {
                'X-Api-Key': config.apiKey,
                'X-Auth-Token': config.authToken
            }
        });

        const paymentRequest = response.data.payment_request;
        const payments = paymentRequest.payments;

        // Check if the specific paymentId exists and is credited
        const successfulPayment = payments.find(p => p.payment_id === paymentId && p.status === 'Credit');

        if (successfulPayment) {
            // Mark order as paid in database
            const mongoOrderId = orderId.replace('ORDER_', '');
            const order = await Order.findById(mongoOrderId);

            if (order && !order.isPaid) {
                order.isPaid = true;
                order.paidAt = new Date();
                order.paymentResult = {
                    id: paymentId,
                    status: 'SUCCESS',
                    update_time: new Date().toISOString(),
                    gateway: 'Instamojo'
                };
                order.status = 'PAID';
                await order.save();
                console.log(`✅ Order ${mongoOrderId} marked as paid via Instamojo verification`);
            }

            return res.json({
                success: true,
                verified: true,
                payment: successfulPayment
            });
        }

        res.json({
            success: true,
            verified: false,
            message: 'Payment not successful'
        });

    } catch (error) {
        console.error('Instamojo Verify Error:', error.response?.data || error.message);
        res.status(500).json({
            message: 'Failed to verify payment',
            error: error.response?.data?.message || error.message
        });
    }
};

// @desc    Instamojo Webhook
const instamojoWebhook = async (req, res) => {
    try {
        const data = req.body;

        // Basic verification
        if (data.status === 'Credit') {
            // Find order by reading purpose or customized logic
            // const orderId = data.purpose.replace('Order #', '');
            // Update DB...
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Instamojo Webhook Error:', error);
        res.status(500).json({ message: 'Webhook processing failed' });
    }
};

module.exports = {
    createInstamojoOrder,
    verifyInstamojoPayment,
    instamojoWebhook
};
