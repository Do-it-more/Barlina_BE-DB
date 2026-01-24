const mongoose = require('mongoose');

const sellerSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    businessName: {
        type: String,
        required: [true, 'Please add a business name'],
        trim: true
    },
    sellerType: {
        type: String,
        enum: ['INDIVIDUAL', 'PROPRIETORSHIP', 'COMPANY'],
        required: true
    },
    gstin: {
        type: String,
        trim: true,
        uppercase: true
        // Optional initially, mandatory for sales later
    },
    pan: {
        type: String,
        required: [true, 'Please add PAN number'],
        trim: true,
        uppercase: true
    },
    bankDetails: {
        accountNumber: { type: String, default: '' },
        ifsc: { type: String, uppercase: true, default: '' },
        holderName: { type: String, default: '' },
        bankName: { type: String, default: '' }
    },
    kyc: {
        panUrl: { type: String },
        aadhaarUrl: { type: String },
        businessProofUrl: { type: String },
        status: {
            type: String,
            enum: ['PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED'],
            default: 'PENDING'
        },
        rejectionReason: { type: String }
    },
    status: {
        type: String,
        enum: ['DRAFT', 'KYC_PENDING', 'VERIFIED', 'RESTRICTED', 'SUSPENDED'],
        default: 'DRAFT'
    },
    onboardingStep: {
        type: Number,
        default: 1 // 1: Basic Info, 2: Bank, 3: KYC, 4: Complete
    },
    isLive: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Seller', sellerSchema);
