const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    createCashfreeOrder,
    verifyCashfreePayment,
    cashfreeWebhook,
    getPaymentStatus
} = require('../controllers/cashfreeController');

// Protected routes
router.post('/cashfree/create-order', protect, createCashfreeOrder);
router.post('/cashfree/verify', protect, verifyCashfreePayment);
router.get('/cashfree/status/:orderId', protect, getPaymentStatus);

// Webhook (public, but signature verified)
router.post('/cashfree/webhook', cashfreeWebhook);

module.exports = router;
