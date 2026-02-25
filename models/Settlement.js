const mongoose = require('mongoose');
const SellerLedger = require('./SellerLedger');

const settlementSchema = mongoose.Schema({
    settlementNumber: {
        type: String,
        unique: true
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Seller'
    },
    periodStart: {
        type: Date,
        required: true
    },
    periodEnd: {
        type: Date,
        required: true
    },
    // Financial Breakdown
    grossAmount: {
        type: Number,
        required: true,
        default: 0
    },
    totalCommission: {
        type: Number,
        default: 0
    },
    totalGST: {
        type: Number,
        default: 0
    },
    totalTDS: {
        type: Number,
        default: 0
    },
    totalReturns: {
        type: Number,
        default: 0
    },
    totalDeductions: {
        type: Number,
        default: 0
    },
    netPayable: {
        type: Number,
        required: true,
        default: 0
    },
    // Status Workflow
    status: {
        type: String,
        enum: ['PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED'],
        default: 'PENDING_APPROVAL',
        index: true
    },
    // Linked ledger entries
    ledgerEntries: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SellerLedger'
    }],
    // Payment Information
    paymentInfo: {
        method: { type: String, default: 'BANK_TRANSFER' },
        utrNumber: { type: String },
        transactionId: { type: String },
        paidAt: { type: Date }
    },
    // Approval Chain
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: { type: Date },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    processedAt: { type: Date },
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    rejectedAt: { type: Date },
    adminNotes: { type: String }
}, {
    timestamps: true
});

// ==================== AUTO-GENERATE SETTLEMENT NUMBER ====================
settlementSchema.pre('save', function (next) {
    if (!this.settlementNumber) {
        const now = new Date();
        const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const random = String(Math.floor(1000 + Math.random() * 9000));
        this.settlementNumber = `STL-${yearMonth}-${random}`;
    }
    next();
});

// ==================== INDEXES ====================
settlementSchema.index({ seller: 1, status: 1 });
settlementSchema.index({ seller: 1, createdAt: -1 });
settlementSchema.index({ status: 1, createdAt: -1 });

// ==================== STATIC METHODS ====================

/**
 * Generate a settlement from eligible ledger entries
 * @param {ObjectId} sellerId - The seller's ID
 * @param {Date} periodStart - Start of the settlement period
 * @param {Date} periodEnd - End of the settlement period
 * @param {ObjectId} createdBy - Admin user who created the settlement
 * @returns {Settlement} The generated settlement
 */
settlementSchema.statics.generateSettlement = async function (sellerId, periodStart, periodEnd, createdBy) {
    // Find all eligible entries for the period
    const eligibleEntries = await SellerLedger.find({
        seller: sellerId,
        status: 'ELIGIBLE',
        createdAt: { $gte: periodStart, $lte: periodEnd }
    });

    if (!eligibleEntries || eligibleEntries.length === 0) {
        throw new Error('No eligible entries found for settlement');
    }

    // Calculate totals
    let grossAmount = 0;
    let totalCommission = 0;
    let totalGST = 0;
    let totalTDS = 0;
    let totalReturns = 0;

    for (const entry of eligibleEntries) {
        grossAmount += entry.grossAmount || 0;
        totalCommission += entry.commission || 0;
        totalGST += entry.gst || 0;
        totalTDS += entry.tds || 0;

        if (entry.type === 'RETURN_DEBIT') {
            totalReturns += Math.abs(entry.netAmount || 0);
        }
    }

    const totalDeductions = totalCommission + totalGST + totalTDS;
    const netPayable = grossAmount - totalDeductions;

    // Create settlement
    const settlement = await this.create({
        seller: sellerId,
        periodStart,
        periodEnd,
        grossAmount,
        totalCommission,
        totalGST,
        totalTDS,
        totalReturns,
        totalDeductions,
        netPayable,
        status: 'PENDING_APPROVAL',
        ledgerEntries: eligibleEntries.map(e => e._id),
        createdBy
    });

    // Mark entries as part of this settlement
    await SellerLedger.updateMany(
        { _id: { $in: eligibleEntries.map(e => e._id) } },
        { $set: { status: 'IN_SETTLEMENT', settlement: settlement._id } }
    );

    return settlement;
};

module.exports = mongoose.model('Settlement', settlementSchema);
