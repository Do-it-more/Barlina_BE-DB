const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from the token
            req.user = await User.findById(decoded.id).select('-password');

            if (req.user && !req.user.isActive) {
                res.status(403);
                throw new Error('Account is disabled');
            }

            next();
        } catch (error) {
            console.error(error);
            res.status(401);
            throw new Error('Not authorized, token failed');
        }
    }

    if (!token) {
        res.status(401);
        throw new Error('Not authorized, no token');
    }
});

const admin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
        next();
    } else {
        res.status(403);
        throw new Error('Not authorized as an admin');
    }
};

const finance = (req, res, next) => {
    if (req.user && (req.user.role === 'finance' || req.user.role === 'super_admin')) {
        next();
    } else {
        res.status(403);
        throw new Error('Not authorized as finance department');
    }
};

const superAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'super_admin') {
        next();
    } else {
        res.status(403);
        throw new Error('Not authorized as a super admin');
    }
};

const checkPermission = (permission) => (req, res, next) => {
    // Super Admin has all permissions
    if (req.user && req.user.role === 'super_admin') {
        next();
        return;
    }

    // Check specific permission
    if (req.user && req.user.permissions && req.user.permissions[permission] === true) {
        next();
    } else {
        res.status(403);
        throw new Error(`Access Denied: You do not have the required permission: ${permission}`);
    }
};

module.exports = { protect, admin, superAdmin, checkPermission, finance };
