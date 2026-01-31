const mongoose = require('mongoose');

const stockSubscriptionSchema = mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Product'
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: false, // Optional, can capture unauthenticated emails too if we wanted, but sticking to logic
        ref: 'User'
    },
    email: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to prevent duplicate subscriptions for same product/email
stockSubscriptionSchema.index({ product: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('StockSubscription', stockSubscriptionSchema);
