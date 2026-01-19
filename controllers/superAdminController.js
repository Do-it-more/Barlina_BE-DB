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

    const type = req.query.type; // 'auth', 'work'
    let actionFilter = {};
    if (type === 'auth') {
        actionFilter = { action: { $in: ['LOGIN', 'LOGOUT'] } };
    } else if (type === 'work') {
        actionFilter = { action: { $nin: ['LOGIN', 'LOGOUT'] } };
    }

    const filter = {
        'performedBy.role': { $in: ['admin', 'super_admin'] }, // Monitor all admin types
        ...keyword,
        ...actionFilter
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

        // Instant RBAC Update via Socket
        if (req.io) {
            req.io.emit('rbac_update', { userId: user._id.toString(), type: 'permissions' });
        }

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

        // Instant RBAC Update via Socket
        if (req.io) {
            req.io.emit('rbac_update', { userId: user._id.toString(), type: 'categories' });
        }

        res.json(updatedUser);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Update user access (Role, Permissions, Categories)
// @route   PUT /api/admin/management/users/:id/access
// @access  Private/SuperAdmin
const updateUserAccess = asyncHandler(async (req, res) => {
    const { role, permissions, categories } = req.body;
    const user = await User.findById(req.params.id);

    if (user) {
        // Update Role
        if (role) {
            user.role = role;
        }

        // Update Permissions
        if (permissions) {
            user.permissions = permissions;
        }

        // Update Categories
        if (categories) {
            user.assignedCategories = categories;
        }

        const updatedUser = await user.save();

        // Instant RBAC Update via Socket
        if (req.io) {
            req.io.emit('rbac_update', { userId: user._id.toString(), type: 'full_access' });
        }

        res.json(updatedUser);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Clear all activity logs
// @route   DELETE /api/admin/management/activity-logs
// @access  Private/SuperAdmin
const clearActivityLogs = asyncHandler(async (req, res) => {
    await AuditLog.deleteMany({});
    res.json({ message: 'All activity logs cleared' });
});

// @desc    Delete single activity log
// @route   DELETE /api/admin/management/activity-logs/:id
// @access  Private/SuperAdmin
const deleteActivityLog = asyncHandler(async (req, res) => {
    const log = await AuditLog.findById(req.params.id);
    if (log) {
        await log.deleteOne();
        res.json({ message: 'Log removed' });
    } else {
        res.status(404);
        throw new Error('Log not found');
    }
});

// @desc    Admin Toggle 2FA for User (Super Admin only)
// @route   PUT /api/admin/management/users/:id/2fa
// @access  Private/SuperAdmin
const toggleUserTwoFactor = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        user.isTwoFactorEnabled = !user.isTwoFactorEnabled;
        const updatedUser = await user.save();
        res.json({
            message: `2FA ${updatedUser.isTwoFactorEnabled ? 'Enabled' : 'Disabled'} for user`,
            isTwoFactorEnabled: updatedUser.isTwoFactorEnabled
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

module.exports = {
    getPermissions,
    assignPermissions,
    assignCategories,
    getAdminActivityLogs,
    updateUserAccess,
    clearActivityLogs,
    deleteActivityLog,
    toggleUserTwoFactor
};
