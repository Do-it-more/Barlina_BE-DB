const mongoose = require('mongoose');

// Approval History Schema for tracking all status changes
const approvalHistorySchema = mongoose.Schema({
    action: { type: String }, // APPROVED, REJECTED, SUSPENDED, etc.
    status: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    timestamp: { type: Date, default: Date.now }, // For frontend compatibility
    reason: { type: String },
    notes: { type: String }
});

const sellerSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    // Business Information
    businessName: {
        type: String,
        required: [true, 'Please add a business name'],
        trim: true
    },
    ownerName: {
        type: String,
        required: [true, 'Please add owner name'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Please add email'],
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        required: [true, 'Please add phone number'],
        trim: true
    },
    sellerType: {
        type: String,
        enum: ['INDIVIDUAL', 'PROPRIETORSHIP', 'PARTNERSHIP', 'COMPANY', 'LLP'],
        required: true
    },
    // Tax & Legal
    gstin: {
        type: String,
        trim: true,
        uppercase: true
        // Optional for small sellers
    },
    pan: {
        type: String,
        required: [true, 'Please add PAN number'],
        trim: true,
        uppercase: true
    },
    // Address
    businessAddress: {
        street: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        pincode: { type: String, default: '' },
        country: { type: String, default: 'India' }
    },
    // Bank Details (for payouts)
    bankDetails: {
        accountNumber: { type: String, default: '' },
        ifsc: { type: String, uppercase: true, default: '' },
        holderName: { type: String, default: '' },
        bankName: { type: String, default: '' },
        branchName: { type: String, default: '' }
    },
    // KYC Documents
    kyc: {
        panUrl: { type: String },
        aadhaarUrl: { type: String },
        addressProofUrl: { type: String },
        businessProofUrl: { type: String },
        chequeUrl: { type: String }, // Cancelled cheque for verification
        bankProofUrl: { type: String }, // Bank statement/passbook
        gstCertificateUrl: { type: String }, // GST registration certificate
        sellerPhotoUrl: { type: String }, // Seller/owner photo for verification
        status: {
            type: String,
            enum: ['NOT_SUBMITTED', 'PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED'],
            default: 'NOT_SUBMITTED'
        },
        rejectionReason: { type: String },
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        verifiedAt: { type: Date }
    },
    // Seller Account Status
    status: {
        type: String,
        enum: [
            'DRAFT',                    // Incomplete registration
            'PENDING_VERIFICATION',     // Submitted, awaiting review
            'UNDER_REVIEW',             // Admin is reviewing
            'APPROVED',                 // Super Admin approved
            'REJECTED',                 // Application rejected
            'SUSPENDED',                // Account suspended
            'BLOCKED'                   // Permanently blocked
        ],
        default: 'DRAFT'
    },
    // Reason for rejection/suspension
    rejectionReason: { type: String },
    suspensionReason: { type: String },
    // Admin Review
    adminReview: {
        status: {
            type: String,
            enum: ['PENDING', 'RECOMMENDED', 'CHANGES_REQUESTED', 'REJECTED'],
            default: 'PENDING'
        },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: { type: Date },
        notes: { type: String }
    },
    // Super Admin Approval
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: { type: Date },
    // Platform Settings
    commissionPercentage: {
        type: Number,
        default: 10, // Default 10% platform fee
        min: 0,
        max: 100
    },
    // Payout Settings
    payoutStatus: {
        type: String,
        enum: ['ACTIVE', 'FROZEN', 'PENDING', 'BLOCKED'],
        default: 'PENDING'
    },
    payoutNotes: { type: String },
    // Onboarding Progress
    onboardingStep: {
        type: Number,
        default: 1 // 1: Basic Info, 2: Address, 3: Bank, 4: KYC, 5: Review
    },
    isOnboardingComplete: {
        type: Boolean,
        default: false
    },
    // Seller Metrics
    metrics: {
        totalProducts: { type: Number, default: 0 },
        liveProducts: { type: Number, default: 0 },
        totalOrders: { type: Number, default: 0 },
        totalRevenue: { type: Number, default: 0 },
        rating: { type: Number, default: 0, min: 0, max: 5 },
        totalRatings: { type: Number, default: 0 },
        cancellationRate: { type: Number, default: 0 },
        returnRate: { type: Number, default: 0 }
    },
    // Admin Internal Notes
    adminNotes: { type: String },
    // Approval History
    approvalHistory: [approvalHistorySchema],
    // Flags
    isLive: {
        type: Boolean,
        default: false
    },
    canAddProducts: {
        type: Boolean,
        default: false
    },
    canReceiveOrders: {
        type: Boolean,
        default: false
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    // Fraud Detection
    flags: {
        isFlagged: { type: Boolean, default: false },
        flagReason: { type: String },
        flaggedAt: { type: Date },
        flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
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

// Indexes for efficient queries
sellerSchema.index({ user: 1 });
sellerSchema.index({ status: 1 });
sellerSchema.index({ 'kyc.status': 1 });
sellerSchema.index({ businessName: 'text', ownerName: 'text', email: 'text' });
sellerSchema.index({ createdAt: -1 });

// Pre-save middleware to add to approval history
sellerSchema.pre('save', function () {
    if (this.isModified('status')) {
        this.approvalHistory.push({
            action: this.status,
            status: this.status,
            changedBy: this._updatedBy || null,
            changedAt: new Date(),
            timestamp: new Date(),
            reason: this._statusChangeReason || '',
            notes: this._statusChangeNotes || ''
        });
    }
    // No next() needed - Mongoose handles this automatically in sync middleware
});

// Method to check if seller can perform actions
sellerSchema.methods.canPerformAction = function (action) {
    const approvedActions = {
        'add_product': this.canAddProducts && this.status === 'APPROVED',
        'receive_orders': this.canReceiveOrders && this.status === 'APPROVED',
        'view_dashboard': ['APPROVED', 'SUSPENDED'].includes(this.status),
        'edit_profile': !['BLOCKED'].includes(this.status)
    };
    return approvedActions[action] || false;
};

module.exports = mongoose.model('Seller', sellerSchema);
