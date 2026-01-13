const mongoose = require('mongoose');

const returnRequestSchema = mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Order'
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    orderItem: {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Product'
        },
        name: { type: String, required: true },
        image: { type: String, required: true },
        price: { type: Number, required: true },
        qty: { type: Number, required: true }
    },
    reason: {
        type: String,
        required: true,
        enum: [
            'DAMAGED',
            'WRONG_ITEM',
            'DEFECTIVE',
            'NOT_AS_DESCRIBED',
            'SIZE_ISSUE',
            'OTHER'
        ]
    },
    status: {
        type: String,
        required: true,
        enum: [
            'REQUESTED',
            'APPROVED',
            'REJECTED',
            'PICKUP_SCHEDULED',
            'PICKED_UP',
            'REFUNDED',
            'REPLACED',
            'COMPLETED'
        ],
        default: 'REQUESTED'
    },
    refundAmount: {
        type: Number,
        default: 0
    },
    comments: { type: String }, // User comments
    adminNote: { type: String }, // Internal Admin Note
    pickupDate: { type: Date }, // Scheduled pickup date
    images: [{ type: String }], // Proof images
    history: [{
        status: String,
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('ReturnRequest', returnRequestSchema);
