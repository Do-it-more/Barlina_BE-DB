const express = require('express');
const router = express.Router();
const {
    getPermissions,
    assignPermissions,
    assignCategories,
    getAdminActivityLogs
} = require('../controllers/superAdminController');
const {
    getPendingApprovals,
    approveRequest,
    rejectRequest
} = require('../controllers/adminApprovalController');
const { protect, superAdmin } = require('../middleware/authMiddleware');

// Permissions
router.route('/permissions').get(protect, superAdmin, getPermissions);

// Admin User Management (Permissions & Categories)
router.route('/users/:id/permissions').put(protect, superAdmin, assignPermissions);
router.route('/users/:id/categories').put(protect, superAdmin, assignCategories);

// Approvals
router.route('/approvals/pending').get(protect, superAdmin, getPendingApprovals);
router.route('/approvals/:id/approve').put(protect, superAdmin, approveRequest);
router.route('/approvals/:id/reject').put(protect, superAdmin, rejectRequest);

// Activity Logs
router.route('/activity-logs').get(protect, superAdmin, getAdminActivityLogs);

module.exports = router;
