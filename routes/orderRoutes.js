const express = require('express');
const router = express.Router();
const {
    addOrderItems,
    getOrderById,
    updateOrderToPaid,
    getMyOrders,
    createPaymentIntent,
    getOrders,
    updateOrderToDelivered,
    cancelOrder,
    getOrderByInvoiceNumber,
    updateOrderEstimatedDelivery,
    updateOrderStatus,
    getOrderAuditLogs,
    updateOrdersStatusBulk,
    getOrderStats,
    getOrderInvoice
} = require('../controllers/orderController');
const { protect, admin, checkPermission } = require('../middleware/authMiddleware');

router.route('/').post(protect, addOrderItems).get(protect, checkPermission('orders'), getOrders);
router.route('/myorders').get(protect, getMyOrders);
router.route('/bulk-status').post(protect, checkPermission('orders'), updateOrdersStatusBulk);
router.route('/create-payment-intent').post(protect, createPaymentIntent);
router.route('/invoice/:invoiceNumber').get(protect, checkPermission('orders'), getOrderByInvoiceNumber);
router.route('/analytics/stats').get(protect, admin, getOrderStats);
router.route('/:id').get(protect, getOrderById);
router.route('/:id/invoice').get(protect, getOrderInvoice);
router.route('/:id/pay').put(protect, updateOrderToPaid);
router.route('/:id/deliver').put(protect, checkPermission('orders'), updateOrderToDelivered);
router.route('/:id/delivery-date').put(protect, checkPermission('orders'), updateOrderEstimatedDelivery);
router.route('/:id/cancel').put(protect, checkPermission('orders'), cancelOrder);
router.route('/:id/status').put(protect, checkPermission('orders'), updateOrderStatus);
router.route('/:id/audit').get(protect, checkPermission('orders'), getOrderAuditLogs);

module.exports = router;
