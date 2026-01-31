const mongoose = require('mongoose');

const walletTransactionSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['CREDIT', 'DEBIT'],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'FAILED'],
        default: 'COMPLETED'
    },
    referenceId: {
        type: String // Order ID or Refund ID
    },
    referenceModel: {
        type: String, // 'Order', 'ReturnRequest'
        default: 'Order'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
