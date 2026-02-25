const mongoose = require('mongoose');

/**
 * Seller Ledger Model
 * Tracks every financial transaction for each seller
 * This is the core of marketplace financial reconciliation
 */
const sellerLedgerSchema = mongoose.Schema({
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: [
            'ORDER_CREDIT',          // Credit when order is placed
            'COMMISSION_DEBIT',      // Platform commission deduction
            'RETURN_DEBIT',          // Deduction for returned items
            'CANCELLATION_DEBIT',    // Deduction for cancelled orders
            'PAYOUT',                // Settlement payout to seller
            'ADJUSTMENT_CREDIT',     // Manual credit adjustment
            'ADJUSTMENT_DEBIT',      // Manual debit adjustment
            'CHARGEBACK_DEBIT',      // Chargeback deduction
            'TDS_DEBIT',             // TDS deduction
            'PENALTY_DEBIT',         // Penalty for policy violations
            'REFUND_REVERSAL_CREDIT' // When refund is reversed
        ]
    },
    // Transaction amounts
    grossAmount: {
        type: Number,
        required: true,
        default: 0
    },
    commission: {
        type: Number,
        default: 0
    },
    commissionRate: {
        type: Number,
        default: 0  // Percentage at time of transaction
    },
    taxAmount: {
        type: Number,
        default: 0  // GST on commission
    },
    tdsAmount: {
        type: Number,
        default: 0  // TDS deducted
    },
    netAmount: {
        type: Number,
        required: true  // Final amount credited/debited
    },
    // Running balance after this transaction
    runningBalance: {
        type: Number,
        required: true,
        default: 0
    },
    // References
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    },
    orderItem: {
        productId: mongoose.Schema.Types.ObjectId,
        productName: String,
        quantity: Number,
        unitPrice: Number
    },
    returnRequest: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ReturnRequest'
    },
    settlement: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Settlement'
    },
    // Status for pending vs completed transactions
    status: {
        type: String,
        enum: ['PENDING', 'ON_HOLD', 'ELIGIBLE', 'SETTLED', 'CANCELLED'],
        default: 'PENDING'
    },
    // Hold period for returns (usually 7-14 days after delivery)
    holdUntil: {
        type: Date
    },
    // Description for clarity
    description: {
        type: String,
        required: true
    },
    // Audit trail
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    metadata: {
        invoiceNumber: String,
        paymentMethod: String,
        gatewayTransactionId: String
    }
}, {
    timestamps: true
});

// Compound indexes for efficient queries
sellerLedgerSchema.index({ seller: 1, createdAt: -1 });
sellerLedgerSchema.index({ seller: 1, status: 1 });
sellerLedgerSchema.index({ order: 1 });
sellerLedgerSchema.index({ settlement: 1 });
sellerLedgerSchema.index({ holdUntil: 1, status: 1 });

// Static method to get seller balance
sellerLedgerSchema.statics.getSellerBalance = async function (sellerId) {
    const result = await this.aggregate([
        { $match: { seller: new mongoose.Types.ObjectId(sellerId), status: { $ne: 'CANCELLED' } } },
        {
            $group: {
                _id: null,
                totalCredits: {
                    $sum: {
                        $cond: [
                            { $in: ['$type', ['ORDER_CREDIT', 'ADJUSTMENT_CREDIT', 'REFUND_REVERSAL_CREDIT']] },
                            '$netAmount',
                            0
                        ]
                    }
                },
                totalDebits: {
                    $sum: {
                        $cond: [
                            { $in: ['$type', ['COMMISSION_DEBIT', 'RETURN_DEBIT', 'CANCELLATION_DEBIT', 'PAYOUT', 'ADJUSTMENT_DEBIT', 'CHARGEBACK_DEBIT', 'TDS_DEBIT', 'PENALTY_DEBIT']] },
                            '$netAmount',
                            0
                        ]
                    }
                },
                pendingAmount: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ['$status', 'PENDING'] }, { $eq: ['$type', 'ORDER_CREDIT'] }] },
                            '$netAmount',
                            0
                        ]
                    }
                },
                onHoldAmount: {
                    $sum: {
                        $cond: [
                            { $eq: ['$status', 'ON_HOLD'] },
                            '$netAmount',
                            0
                        ]
                    }
                }
            }
        }
    ]);

    if (result.length === 0) {
        return { currentBalance: 0, pendingAmount: 0, onHoldAmount: 0, availableForPayout: 0 };
    }

    const currentBalance = result[0].totalCredits - result[0].totalDebits;
    const availableForPayout = currentBalance - result[0].pendingAmount - result[0].onHoldAmount;

    return {
        currentBalance,
        pendingAmount: result[0].pendingAmount,
        onHoldAmount: result[0].onHoldAmount,
        availableForPayout: Math.max(0, availableForPayout)
    };
};

// Static method to get eligible transactions for settlement
sellerLedgerSchema.statics.getEligibleForSettlement = async function (sellerId) {
    const now = new Date();
    return this.find({
        seller: sellerId,
        status: 'ON_HOLD',
        holdUntil: { $lte: now }
    }).sort({ createdAt: 1 });
};

// Instance method to mark as eligible
sellerLedgerSchema.methods.markEligible = async function () {
    this.status = 'ELIGIBLE';
    return this.save();
};

module.exports = mongoose.model('SellerLedger', sellerLedgerSchema);
