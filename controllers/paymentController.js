const Setting = require('../models/Setting');
const { createCashfreeOrder, verifyCashfreePayment } = require('./cashfreeController');
const { createInstamojoOrder, verifyInstamojoPayment } = require('./instamojoController');
const { createRazorpayOrder, verifyRazorpayPayment } = require('./razorpayController');

// @desc    Get Active Gateway
const getActiveGateway = async () => {
    const settings = await Setting.findOne();
    return settings?.paymentGateways?.activeGateway || 'razorpay';
};

// @desc    Create Payment Order (Route to active gateway)
// @route   POST /api/payments/create-order
// @access  Private
const createOrder = async (req, res) => {
    try {
        const activeGateway = await getActiveGateway();

        // If gateway is specified in query (for testing/overriding), use that
        let targetGateway = req.query.gateway || activeGateway;

        if (targetGateway === 'instamojo') return createInstamojoOrder(req, res);
        if (targetGateway === 'cashfree') return createCashfreeOrder(req, res);
        if (targetGateway === 'razorpay') return createRazorpayOrder(req, res);

        // Default Fallback
        return createRazorpayOrder(req, res);

    } catch (error) {
        console.error('Payment Routing Error:', error);
        res.status(500).json({ message: 'Failed to route payment request' });
    }
};

// @desc    Verify Payment Order (Route based on request params or trial)
// @route   POST /api/payments/verify
// @access  Private
const verifyPayment = async (req, res) => {
    try {
        const { gateway } = req.body; // Frontend should explicitly send which gateway was used

        if (gateway === 'instamojo') {
            return verifyInstamojoPayment(req, res);
        } else if (gateway === 'cashfree') {
            return verifyCashfreePayment(req, res);
        } else if (gateway === 'razorpay') {
            return verifyRazorpayPayment(req, res);
        } else {
            // Fallback: Try to detect or create separated logic
            const activeGateway = await getActiveGateway();
            if (activeGateway === 'instamojo') return verifyInstamojoPayment(req, res);
            if (activeGateway === 'cashfree') return verifyCashfreePayment(req, res);
            return verifyRazorpayPayment(req, res);
        }
    } catch (error) {
        console.error('Payment Verification Routing Error:', error);
        res.status(500).json({ message: 'Failed to route verification request' });
    }
};

// @desc    Get configured public keys (if needed by frontend)
const getPaymentConfig = async (req, res) => {
    const settings = await Setting.findOne();
    const gateways = settings?.paymentGateways;

    res.json({
        activeGateway: gateways?.activeGateway || 'razorpay',
        isCashfreeActive: gateways?.cashfree?.isActive,
        isInstamojoActive: gateways?.instamojo?.isActive,
        isRazorpayActive: gateways?.razorpay?.isActive,
    });
};

module.exports = {
    createOrder,
    verifyPayment,
    getPaymentConfig
};
