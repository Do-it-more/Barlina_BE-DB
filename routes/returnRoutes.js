const express = require('express');
const router = express.Router();
const {
    getReturnEligibility,
    requestReturn,
    updateReturnStatus,
    getReturnRequests,
    getMyReturnRequests,
    schedulePickup
} = require('../controllers/returnController');
const { protect, admin, checkPermission } = require('../middleware/authMiddleware');

router.route('/').get(protect, checkPermission('returns'), getReturnRequests);
router.route('/my').get(protect, getMyReturnRequests);
router.route('/:id/status').put(protect, checkPermission('returns'), updateReturnStatus);
router.route('/:id/schedule').put(protect, schedulePickup);

// Order-specific return routes (these could be under /orders too, but keeping return logic centralized here for consistency or mixing)
// Actually, the controller is designed to take orderId in params for creation.
// Let's expose strict routes:

router.route('/eligibility/:id').get(protect, getReturnEligibility); // :id is Order ID
router.route('/request/:id').post(protect, requestReturn); // :id is Order ID

module.exports = router;
