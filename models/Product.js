const mongoose = require('mongoose');

const reviewSchema = mongoose.Schema({
    name: { type: String, required: true },
    rating: { type: Number, required: true },
    comment: { type: String, required: true },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
}, {
    timestamps: true
});

// Product Approval History Schema
const productApprovalHistorySchema = mongoose.Schema({
    status: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String },
    notes: { type: String }
});

const productSchema = mongoose.Schema({
    // Creator - Admin or Seller
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    // Seller Reference (for multi-vendor products)
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        default: null // null means platform/admin product
    },
    // Product Ownership Type
    ownerType: {
        type: String,
        enum: ['PLATFORM', 'SELLER'],
        default: 'PLATFORM'
    },
    name: {
        type: String,
        required: [true, 'Please add a product name']
    },
    image: {
        type: String,
        required: [true, 'Please add an image URL']
    },
    images: [{
        type: String
    }],
    brand: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    reviews: [reviewSchema],
    price: {
        type: Number,
        required: true,
        default: 0
    },
    countInStock: {
        type: Number,
        required: true,
        default: 0,
        min: [0, 'Stock cannot be negative']
    },
    isStockEnabled: {
        type: Boolean,
        default: true
    },
    rating: {
        type: Number,
        required: true,
        default: 0
    },
    numReviews: {
        type: Number,
        required: true,
        default: 0
    },
    discountPrice: {
        type: Number,
        default: 0
    },
    isCodAvailable: {
        type: Boolean,
        required: true,
        default: true
    },
    estimatedDeliveryDays: {
        type: Number,
        required: false
    },
    colors: [{
        type: String
    }],
    specifications: [{
        heading: { type: String },
        items: [{
            key: { type: String },
            value: { type: String }
        }]
    }],
    returnPolicy: {
        isReturnable: {
            type: Boolean,
            default: true,
            required: true
        },
        returnWindowDays: {
            type: Number,
            default: 7,
            min: 0,
            max: 90
        },
        returnType: {
            type: String,
            enum: ['REFUND', 'REPLACEMENT', 'BOTH', 'NO_RETURN'],
            default: 'REFUND'
        }
    },

    // ============ PRODUCT LISTING STATUS (SELLER WORKFLOW) ============
    listingStatus: {
        type: String,
        enum: [
            'DRAFT',            // Incomplete product, not submitted
            'UNDER_REVIEW',     // Submitted by seller, awaiting admin review
            'APPROVED',         // Admin/Super Admin approved
            'REJECTED',         // Product rejected
            'BLOCKED',          // Blocked by admin/super admin
            'DELISTED'          // Temporarily removed from listing
        ],
        default: 'APPROVED' // Platform products are auto-approved
    },
    // Is the product visible to customers?
    isLive: {
        type: Boolean,
        default: true
    },
    // Review Information
    reviewInfo: {
        submittedAt: { type: Date },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: { type: Date },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        approvedAt: { type: Date },
        rejectionReason: { type: String },
        adminNotes: { type: String }
    },
    // Approval History
    approvalHistory: [productApprovalHistorySchema],
    // Flags for moderation
    flags: {
        isFlagged: { type: Boolean, default: false },
        flagReason: { type: String },
        flaggedAt: { type: Date },
        flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    // Quality Score (for ranking)
    qualityScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    // Soft Delete
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

// OPTIMIZATION: Indexes for faster search and filtering
productSchema.index({ name: 'text', description: 'text', brand: 'text' }); // Full-Text Search
productSchema.index({ category: 1 }); // Filter by Category
productSchema.index({ price: 1 });    // Sort/Filter by Price
productSchema.index({ rating: -1 });  // Sort by Rating (High to Low)
productSchema.index({ createdAt: -1 }); // Sort by Newest
productSchema.index({ seller: 1 });    // Filter by Seller
productSchema.index({ listingStatus: 1 }); // Filter by Status
productSchema.index({ isLive: 1, listingStatus: 1 }); // Compound for live products
productSchema.index({ ownerType: 1 }); // Filter Platform vs Seller

// Pre-save middleware to add to approval history
productSchema.pre('save', function () {
    if (this.isModified('listingStatus')) {
        this.approvalHistory.push({
            status: this.listingStatus,
            changedBy: this._updatedBy || null,
            reason: this._statusChangeReason || '',
            notes: this._statusChangeNotes || ''
        });
    }
});

// Static method to get products for review
productSchema.statics.getProductsForReview = function () {
    return this.find({
        listingStatus: 'UNDER_REVIEW',
        isDeleted: false
    }).populate('seller user', 'businessName name email');
};

// Instance method to check if product can be edited
productSchema.methods.canBeEdited = function (userId, userRole) {
    // Super Admin can always edit
    if (userRole === 'super_admin') return true;

    // Admin can edit platform products
    if (userRole === 'admin' && this.ownerType === 'PLATFORM') return true;

    // Seller can edit their own products if DRAFT or REJECTED
    if (userRole === 'seller' &&
        this.user.toString() === userId.toString() &&
        ['DRAFT', 'REJECTED'].includes(this.listingStatus)) {
        return true;
    }

    return false;
};

module.exports = mongoose.model('Product', productSchema);
