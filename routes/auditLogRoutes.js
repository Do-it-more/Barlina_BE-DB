const express = require('express');
const router = express.Router();
const {
    getAuditLogs,
    getAuditLogById,
    getEntityAuditLogs,
    exportAuditLogs,
    getAuditLogStats,
    logSessionClose
} = require('../controllers/auditLogController');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Beacon for closing session (Available to all authenticated admins)
// Using POST because we are creating a log
router.post('/beacon', logSessionClose);

// Super Admin only routes
router.get('/', superAdmin, getAuditLogs);
router.get('/export', superAdmin, exportAuditLogs);
router.get('/stats', superAdmin, getAuditLogStats);
router.get('/:id', superAdmin, getAuditLogById);

// Admin can view entity-specific logs
router.get('/entity/:model/:id', admin, getEntityAuditLogs);

module.exports = router;
