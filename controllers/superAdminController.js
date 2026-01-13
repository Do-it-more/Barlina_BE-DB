const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Permission = require('../models/Permission');
const AuditLog = require('../models/AuditLog');

// @desc    Get Admin Activity Logs (Super Admin)
// @route   GET /api/admin/management/activity-logs
// @access  Private/SuperAdmin
const getAdminActivityLogs = asyncHandler(async (req, res) => {
    const pageSize = 20;
    const page = Number(req.query.pageNumber) || 1;

    // Filter by role 'admin'. Can also optionally include 'super_admin' if needed, 
    // but request says "track admin activity".
    // We can also allow filtering by specific admin ID if passed in query.
    const keyword = req.query.keyword ? {
        'performedBy.name': {
            $regex: req.query.keyword,
            $options: 'i'
        }
    } : {};

    const filter = {
        'performedBy.role': { $in: ['admin', 'super_admin'] }, // Monitor all admin types
        ...keyword
    };

    const count = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(pageSize)
        .skip(pageSize * (page - 1));

    res.json({ logs, page, pages: Math.ceil(count / pageSize) });
});

// @desc    Get all permissions
// @route   GET /api/admin/management/permissions
// @access  Private/SuperAdmin
const getPermissions = asyncHandler(async (req, res) => {
    const permissions = await Permission.find({});
    res.json(permissions);
});

// @desc    Assign permissions to an admin
// @route   PUT /api/admin/management/users/:id/permissions
// @access  Private/SuperAdmin
const assignPermissions = asyncHandler(async (req, res) => {
    const { permissions } = req.body;
    const user = await User.findById(req.params.id);

    if (user) {
        user.permissions = permissions;
        const updatedUser = await user.save();
        res.json(updatedUser);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Assign categories to an admin
// @route   PUT /api/admin/management/users/:id/categories
// @access  Private/SuperAdmin
const assignCategories = asyncHandler(async (req, res) => {
    const { categories } = req.body;
    const user = await User.findById(req.params.id);

    if (user) {
        user.assignedCategories = categories;
        const updatedUser = await user.save();
        res.json(updatedUser);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

module.exports = {
    getPermissions,
    assignPermissions,
    assignCategories,
    getAdminActivityLogs
};
