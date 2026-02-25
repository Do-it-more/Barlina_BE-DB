const asyncHandler = require('express-async-handler');
const Coupon = require('../models/Coupon');

// @desc    Create a new coupon
// @route   POST /api/coupons
// @access  Private/Admin
const createCoupon = asyncHandler(async (req, res) => {
    const { code, discountPercentage, expiryDate } = req.body;

    const couponExists = await Coupon.findOne({ code });

    if (couponExists) {
        res.status(400);
        throw new Error('Coupon code already exists');
    }

    const coupon = await Coupon.create({
        code,
        discountPercentage,
        expiryDate
    });

    if (coupon) {
        res.status(201).json(coupon);
    } else {
        res.status(400);
        throw new Error('Invalid coupon data');
    }
});

// @desc    Validate a coupon
// @route   POST /api/coupons/validate
// @access  Private (or Public)
const validateCoupon = asyncHandler(async (req, res) => {
    const { code, orderValue } = req.body;
    const userId = req.user?._id;

    if (!code) {
        res.status(400);
        throw new Error('Coupon code is required');
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon) {
        res.status(404);
        throw new Error('Invalid coupon code');
    }

    if (!coupon.isActive) {
        res.status(400);
        throw new Error('This coupon is no longer active');
    }

    // Enhanced validation using new model methods
    if (userId && orderValue) {
        // Get user's order count for first-order check
        const Order = require('../models/Order');
        const userOrderCount = await Order.countDocuments({
            user: userId,
            isPaid: true,
            isCancelled: false
        });

        const validation = await coupon.canBeUsedBy(userId, orderValue, userOrderCount);

        if (!validation.isValid) {
            res.status(400);
            throw new Error(validation.errors[0]);
        }

        const discount = coupon.calculateDiscount(orderValue);

        res.json({
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discountPercentage: coupon.discountType === 'PERCENTAGE' ? coupon.discountValue : null,
            calculatedDiscount: discount,
            maxDiscount: coupon.maxDiscount,
            minOrderValue: coupon.minOrderValue,
            message: 'Coupon Applied!'
        });
    } else {
        // Basic validation (legacy support)
        const now = new Date();
        if (now > coupon.expiryDate) {
            res.status(400);
            throw new Error('Coupon expired');
        }

        res.json({
            code: coupon.code,
            discountType: coupon.discountType || 'PERCENTAGE',
            discountValue: coupon.discountValue || coupon.discountPercentage,
            discountPercentage: coupon.discountType === 'PERCENTAGE' ? coupon.discountValue : null,
            maxDiscount: coupon.maxDiscount,
            minOrderValue: coupon.minOrderValue || 0,
            message: 'Coupon Applied!'
        });
    }
});


// @desc    Get all coupons
// @route   GET /api/coupons
// @access  Private/Admin
const getCoupons = asyncHandler(async (req, res) => {
    const coupons = await Coupon.find({});
    res.json(coupons);
});

// @desc    Delete a coupon
// @route   DELETE /api/coupons/:id
// @access  Private/Admin
const deleteCoupon = asyncHandler(async (req, res) => {
    const coupon = await Coupon.findById(req.params.id);

    if (coupon) {
        await coupon.deleteOne();
        res.json({ message: 'Coupon removed' });
    } else {
        res.status(404);
        throw new Error('Coupon not found');
    }
});



// @desc    Get all active coupons for banner display
// @route   GET /api/coupons/active
// @access  Public
const getActiveCoupons = asyncHandler(async (req, res) => {
    const coupons = await Coupon.find({
        isActive: true,
        showInBanner: true,  // Only show coupons marked for banner display
        expiryDate: { $gt: new Date() }
    }).select('code discountPercentage expiryDate'); // Only send necessary fields
    res.json(coupons);
});

// @desc    Update a coupon
// @route   PUT /api/coupons/:id
// @access  Private/Admin
const updateCoupon = asyncHandler(async (req, res) => {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
        res.status(404);
        throw new Error('Coupon not found');
    }

    // Update fields if provided
    if (req.body.code !== undefined) coupon.code = req.body.code;
    if (req.body.discountPercentage !== undefined) coupon.discountPercentage = req.body.discountPercentage;
    if (req.body.expiryDate !== undefined) coupon.expiryDate = req.body.expiryDate;
    if (req.body.isActive !== undefined) coupon.isActive = req.body.isActive;
    if (req.body.showInBanner !== undefined) coupon.showInBanner = req.body.showInBanner;

    const updatedCoupon = await coupon.save();
    res.json(updatedCoupon);
});

module.exports = {
    createCoupon,
    validateCoupon,
    getCoupons,
    deleteCoupon,
    getActiveCoupons,
    updateCoupon
};
