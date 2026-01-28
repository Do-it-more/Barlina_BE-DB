const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    createOrder,
    verifyPayment,
    getPaymentConfig
} = require('../controllers/paymentController');

const { cashfreeWebhook, getPaymentStatus } = require('../controllers/cashfreeController');
const { instamojoWebhook } = require('../controllers/instamojoController');

// Unified Payment Routes
router.post('/create-order', protect, createOrder);
router.post('/verify', protect, verifyPayment);
router.get('/config', protect, getPaymentConfig);

// Specific Status Check
router.get('/cashfree/status/:orderId', protect, getPaymentStatus);

// Webhooks (Public)
router.post('/cashfree/webhook', cashfreeWebhook);
router.post('/instamojo/webhook', instamojoWebhook);

module.exports = router;
