const express = require('express');
const router = express.Router();
const {
    getDashboardStats,
    downloadSalesReport,
    downloadComplaintReport,
    downloadOrderReport,
    downloadTodayOrdersReport,
    downloadShippedOrdersReport,
    downloadDeliveredOrdersReport
} = require('../controllers/reportController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/dashboard').get(protect, admin, getDashboardStats);
router.route('/sales/download').get(protect, admin, downloadSalesReport);
router.route('/complaints/download').get(protect, admin, downloadComplaintReport);
router.route('/orders/download').get(protect, admin, downloadOrderReport);

// New Report Routes
router.route('/orders/today/download').get(protect, admin, downloadTodayOrdersReport);
router.route('/orders/shipped/download').get(protect, admin, downloadShippedOrdersReport);
router.route('/orders/delivered/download').get(protect, admin, downloadDeliveredOrdersReport);

module.exports = router;
