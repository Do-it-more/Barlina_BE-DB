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

            return next();
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

const admin = asyncHandler(async (req, res, next) => {
    const allowedRoles = ['admin', 'super_admin', 'finance', 'seller_admin'];
    if (req.user && allowedRoles.includes(req.user.role)) {
        next();
    } else {
        res.status(403);
        throw new Error('Not authorized as an admin');
    }
});

const finance = asyncHandler(async (req, res, next) => {
    if (req.user && (req.user.role === 'finance' || req.user.role === 'super_admin')) {
        next();
    } else {
        res.status(403);
        throw new Error('Not authorized as finance department');
    }
});

const superAdmin = asyncHandler(async (req, res, next) => {
    if (req.user && req.user.role === 'super_admin') {
        next();
    } else {
        res.status(403);
        throw new Error('Not authorized as a super admin');
    }
});

const checkPermission = (permission) => asyncHandler(async (req, res, next) => {
    // Super Admin has all permissions
    if (req.user && req.user.role === 'super_admin') {
        next();
        return;
    }

    // Admins, Finance, Seller Admin check permissions
    const staffRoles = ['admin', 'finance', 'seller_admin'];
    if (req.user && staffRoles.includes(req.user.role)) {
        if (req.user.permissions && req.user.permissions[permission] === true) {
            next();
            return;
        }
    }

    // Fallback error
    res.status(403);
    throw new Error(`Access Denied: You do not have the required permission: ${permission}`);
});

// Seller middleware - checks if user is a seller
const seller = asyncHandler(async (req, res, next) => {
    if (req.user && (req.user.role === 'seller' || req.user.role === 'super_admin' || req.user.role === 'admin')) {
        next();
    } else {
        res.status(403);
        throw new Error('Not authorized - seller access required');
    }
});

// Approved Seller middleware - checks if seller account is approved
const Seller = require('../models/Seller');
const approvedSeller = asyncHandler(async (req, res, next) => {
    // Super Admin and Admin bypass
    if (req.user && (req.user.role === 'super_admin' || req.user.role === 'admin')) {
        next();
        return;
    }

    if (req.user && req.user.role === 'seller') {
        const sellerProfile = await Seller.findOne({ user: req.user._id });

        if (!sellerProfile) {
            res.status(403);
            throw new Error('Seller profile not found');
        }

        if (sellerProfile.status !== 'APPROVED') {
            res.status(403);
            throw new Error('Seller account is not approved. Please wait for approval.');
        }

        if (!sellerProfile.canAddProducts) {
            res.status(403);
            throw new Error('You do not have permission to add products');
        }

        // Attach seller to request for easy access
        req.seller = sellerProfile;
        next();
    } else {
        res.status(403);
        throw new Error('Not authorized - approved seller access required');
    }
});

// Middleware to verify seller owns the resource
const verifySellerOwnership = (resourceType) => asyncHandler(async (req, res, next) => {
    // Super Admin and Admin bypass
    if (req.user && (req.user.role === 'super_admin' || req.user.role === 'admin')) {
        next();
        return;
    }

    if (req.user && req.user.role === 'seller') {
        const sellerProfile = await Seller.findOne({ user: req.user._id });

        if (!sellerProfile) {
            res.status(403);
            throw new Error('Seller profile not found');
        }

        // Check ownership based on resource type
        if (resourceType === 'product') {
            const Product = require('../models/Product');
            const product = await Product.findById(req.params.id);

            if (!product) {
                res.status(404);
                throw new Error('Product not found');
            }

            if (product.seller && product.seller.toString() !== sellerProfile._id.toString()) {
                res.status(403);
                throw new Error('You do not have access to this product');
            }
        }

        req.seller = sellerProfile;
        next();
    } else {
        res.status(403);
        throw new Error('Not authorized');
    }
});

module.exports = {
    protect,
    admin,
    superAdmin,
    checkPermission,
    finance,
    seller,
    approvedSeller,
    verifySellerOwnership
};

