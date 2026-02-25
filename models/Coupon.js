const mongoose = require('mongoose');

/**
 * Enhanced Coupon Model with Abuse Protection
 * Prevents unlimited usage, tracks per-user limits, and supports various coupon types
 */
const couponSchema = mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    // Discount configuration
    discountType: {
        type: String,
        enum: ['PERCENTAGE', 'FIXED'],
        default: 'PERCENTAGE'
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    // For percentage discounts - cap the maximum discount
    maxDiscount: {
        type: Number,
        default: null  // null means no cap
    },
    // Minimum order value to apply coupon
    minOrderValue: {
        type: Number,
        default: 0
    },
    // ABUSE PROTECTION: Usage limits
    usageLimit: {
        type: Number,
        default: null  // null means unlimited
    },
    usedCount: {
        type: Number,
        default: 0
    },
    // Per-user usage limit
    perUserLimit: {
        type: Number,
        default: 1  // Default: 1 use per user
    },
    // Track which users have used this coupon
    usedBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        usedAt: {
            type: Date,
            default: Date.now
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order'
        },
        discountApplied: Number
    }],
    // Category/Seller restrictions
    validCategories: [{
        type: String
    }],
    validSellers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller'
    }],
    excludedProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],
    // Customer targeting
    firstOrderOnly: {
        type: Boolean,
        default: false
    },
    userWhitelist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // Validity
    expiryDate: {
        type: Date,
        required: true
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Display settings
    showInBanner: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        default: ''
    },
    termsAndConditions: {
        type: String,
        default: ''
    },
    // Creator tracking
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes for efficient lookup
// code is unique, so index is created automatically
couponSchema.index({ isActive: 1, expiryDate: 1 });
couponSchema.index({ 'usedBy.user': 1 });

// Method to check if coupon can be used by a user
couponSchema.methods.canBeUsedBy = async function (userId, orderValue, userOrderCount = null) {
    const errors = [];

    // Check if active
    if (!this.isActive) {
        errors.push('Coupon is not active');
    }

    // Check expiry
    const now = new Date();
    if (now < this.startDate) {
        errors.push('Coupon is not yet valid');
    }
    if (now > this.expiryDate) {
        errors.push('Coupon has expired');
    }

    // Check global usage limit
    if (this.usageLimit !== null && this.usedCount >= this.usageLimit) {
        errors.push('Coupon usage limit reached');
    }

    // Check per-user limit
    const userUsage = this.usedBy.filter(u => u.user.toString() === userId.toString());
    if (userUsage.length >= this.perUserLimit) {
        errors.push(`You have already used this coupon ${this.perUserLimit} time(s)`);
    }

    // Check minimum order value
    if (orderValue < this.minOrderValue) {
        errors.push(`Minimum order value of ₹${this.minOrderValue} required`);
    }

    // Check first order only
    if (this.firstOrderOnly && userOrderCount !== null && userOrderCount > 0) {
        errors.push('This coupon is valid for first order only');
    }

    // Check user whitelist
    if (this.userWhitelist && this.userWhitelist.length > 0) {
        const isWhitelisted = this.userWhitelist.some(u => u.toString() === userId.toString());
        if (!isWhitelisted) {
            errors.push('This coupon is not available for your account');
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

// Method to calculate discount
couponSchema.methods.calculateDiscount = function (orderValue) {
    let discount = 0;

    if (this.discountType === 'PERCENTAGE') {
        discount = (orderValue * this.discountValue) / 100;
        // Apply max discount cap if set
        if (this.maxDiscount !== null && discount > this.maxDiscount) {
            discount = this.maxDiscount;
        }
    } else {
        discount = this.discountValue;
    }

    // Discount cannot exceed order value
    return Math.min(discount, orderValue);
};

// Method to record usage
couponSchema.methods.recordUsage = async function (userId, orderId, discountApplied) {
    this.usedBy.push({
        user: userId,
        orderId,
        discountApplied,
        usedAt: new Date()
    });
    this.usedCount += 1;
    return this.save();
};

// Static method to validate and apply coupon
couponSchema.statics.validateAndApply = async function (code, userId, orderValue, userOrderCount) {
    const coupon = await this.findOne({ code: code.toUpperCase() });

    if (!coupon) {
        throw new Error('Invalid coupon code');
    }

    const validation = await coupon.canBeUsedBy(userId, orderValue, userOrderCount);

    if (!validation.isValid) {
        throw new Error(validation.errors[0]);
    }

    const discount = coupon.calculateDiscount(orderValue);

    return {
        coupon,
        discount,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue
    };
};

// Legacy support for discountPercentage
couponSchema.virtual('discountPercentage').get(function () {
    return this.discountType === 'PERCENTAGE' ? this.discountValue : null;
});

module.exports = mongoose.model('Coupon', couponSchema);
