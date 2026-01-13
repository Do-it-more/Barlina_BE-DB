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
    const { code } = req.body;

    const coupon = await Coupon.findOne({ code });

    if (coupon && coupon.isActive) {
        // Check expiry
        if (new Date() > new Date(coupon.expiryDate)) {
            res.status(400);
            throw new Error('Coupon expired');
        }

        res.json({
            code: coupon.code,
            discountPercentage: coupon.discountPercentage,
            message: 'Coupon Applied!'
        });
    } else {
        res.status(404);
        throw new Error('Invalid or inactive coupon');
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



// @desc    Get all active coupons
// @route   GET /api/coupons/active
// @access  Public
const getActiveCoupons = asyncHandler(async (req, res) => {
    const coupons = await Coupon.find({
        isActive: true,
        expiryDate: { $gt: new Date() }
    }).select('code discountPercentage expiryDate'); // Only send necessary fields
    res.json(coupons);
});

module.exports = {
    createCoupon,
    validateCoupon,
    getCoupons,
    deleteCoupon,
    getActiveCoupons
};
