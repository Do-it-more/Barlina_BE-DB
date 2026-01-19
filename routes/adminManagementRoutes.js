const express = require('express');
const router = express.Router();
const {
    getPermissions,
    assignPermissions,
    assignCategories,
    getAdminActivityLogs,
    updateUserAccess,
    clearActivityLogs,
    deleteActivityLog,
    toggleUserTwoFactor
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
router.route('/users/:id/access').put(protect, superAdmin, updateUserAccess);
router.route('/users/:id/2fa').put(protect, superAdmin, toggleUserTwoFactor);

// Approvals
router.route('/approvals/pending').get(protect, superAdmin, getPendingApprovals);
router.route('/approvals/:id/approve').put(protect, superAdmin, approveRequest);
router.route('/approvals/:id/reject').put(protect, superAdmin, rejectRequest);

// Activity Logs
router.route('/activity-logs').get(protect, superAdmin, getAdminActivityLogs);
router.route('/activity-logs').delete(protect, superAdmin, clearActivityLogs);
router.route('/activity-logs/:id').delete(protect, superAdmin, deleteActivityLog);

module.exports = router;
