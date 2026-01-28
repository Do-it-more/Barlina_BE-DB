const asyncHandler = require('express-async-handler');
const AuditLog = require('../models/AuditLog');

// @desc    Get all audit logs with filters
// @route   GET /api/admin/audit-logs
// @access  Private/Super Admin Only
const getAuditLogs = asyncHandler(async (req, res) => {
    const {
        search,
        action,
        targetModel,
        dateFrom,
        dateTo,
        role,
        page = 1,
        limit = 20
    } = req.query;

    // Build filter
    const filter = {};

    if (action) {
        filter.action = action;
    }

    if (targetModel) {
        filter.targetModel = targetModel;
    }

    if (role) {
        filter['performedBy.role'] = role;
    }

    if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) {
            filter.createdAt.$gte = new Date(dateFrom);
        }
        if (dateTo) {
            filter.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
        }
    }

    if (search) {
        filter.$or = [
            { 'performedBy.name': { $regex: search, $options: 'i' } },
            { action: { $regex: search, $options: 'i' } },
            { details: { $regex: search, $options: 'i' } },
            { reason: { $regex: search, $options: 'i' } }
        ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, totalCount] = await Promise.all([
        AuditLog.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit)),
        AuditLog.countDocuments(filter)
    ]);

    res.json({
        logs,
        page: parseInt(page),
        pages: Math.ceil(totalCount / parseInt(limit)),
        total: totalCount
    });
});

// @desc    Get audit log by ID
// @route   GET /api/admin/audit-logs/:id
// @access  Private/Super Admin Only
const getAuditLogById = asyncHandler(async (req, res) => {
    const log = await AuditLog.findById(req.params.id);

    if (!log) {
        res.status(404);
        throw new Error('Audit log not found');
    }

    res.json(log);
});

// @desc    Get audit logs for a specific entity
// @route   GET /api/admin/audit-logs/entity/:model/:id
// @access  Private/Admin
const getEntityAuditLogs = asyncHandler(async (req, res) => {
    const { model, id } = req.params;

    const logs = await AuditLog.find({
        targetModel: model.toUpperCase(),
        targetId: id
    })
        .sort({ createdAt: -1 })
        .limit(50);

    res.json(logs);
});

// @desc    Export audit logs
// @route   GET /api/admin/audit-logs/export
// @access  Private/Super Admin Only
const exportAuditLogs = asyncHandler(async (req, res) => {
    const {
        action,
        targetModel,
        dateFrom,
        dateTo
    } = req.query;

    const filter = {};

    if (action) {
        filter.action = action;
    }

    if (targetModel) {
        filter.targetModel = targetModel;
    }

    if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) {
            filter.createdAt.$gte = new Date(dateFrom);
        }
        if (dateTo) {
            filter.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
        }
    }

    const logs = await AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(10000); // Max export limit

    // Convert to CSV
    const headers = ['Timestamp', 'Action', 'Performed By', 'Role', 'Target Model', 'Target ID', 'Details', 'Reason'];
    const csvRows = [headers.join(',')];

    logs.forEach(log => {
        const row = [
            new Date(log.createdAt).toISOString(),
            log.action || '',
            log.performedBy?.name || '',
            log.performedBy?.role || '',
            log.targetModel || '',
            log.targetId || '',
            (log.details || '').replace(/,/g, ';'),
            (log.reason || '').replace(/,/g, ';')
        ];
        csvRows.push(row.map(val => `"${val}"`).join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
});

// @desc    Get audit log statistics
// @route   GET /api/admin/audit-logs/stats
// @access  Private/Super Admin Only
const getAuditLogStats = asyncHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    const [
        totalLogs,
        todayLogs,
        weekLogs,
        actionStats,
        roleStats
    ] = await Promise.all([
        AuditLog.countDocuments(),
        AuditLog.countDocuments({ createdAt: { $gte: today } }),
        AuditLog.countDocuments({ createdAt: { $gte: lastWeek } }),
        AuditLog.aggregate([
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]),
        AuditLog.aggregate([
            { $group: { _id: '$performedBy.role', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ])
    ]);

    res.json({
        total: totalLogs,
        today: todayLogs,
        thisWeek: weekLogs,
        topActions: actionStats,
        byRole: roleStats
    });
});

// @desc    Log session close (Beacon)
// @route   POST /api/admin/audit-logs/beacon
// @access  Public (Token passed in body or header if possible, but for beacon we might need loose auth or rely on cookie if present. Since we use Bearer, we'll try to extract from body)
const logSessionClose = asyncHandler(async (req, res) => {
    // Beacon often sends text/plain or Blob. Body parser might need to handle it.
    // We assume the frontend sends JSON string via Blob.

    // For safety, we verify user manually if not using standard middleware (Beacon request might not have auth headers easily if using navigator.sendBeacon)
    // However, we will try to use fetch with keepalive which supports headers.
    // If standard middleware works, req.user is set.

    if (req.user && ['admin', 'super_admin', 'finance', 'seller_admin'].includes(req.user.role)) {
        await AuditLog.create({
            action: 'SESSION_CLOSED',
            performedBy: {
                id: req.user._id,
                name: req.user.name,
                role: req.user.role,
                email: req.user.email
            },
            targetId: req.user._id,
            targetModel: 'User',
            details: 'Admin closed tab or browser'
        });
    }

    // Beacon requests don't expect a response, but we send 200.
    res.status(200).send('OK');
});

module.exports = {
    getAuditLogs,
    getAuditLogById,
    getEntityAuditLogs,
    exportAuditLogs,
    getAuditLogStats,
    logSessionClose
};
