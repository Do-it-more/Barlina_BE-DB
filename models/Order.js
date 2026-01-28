const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    invoiceNumber: {
        type: String,
        // unique and sparse removed to prevent E11000 index clashes on null/undefined values
        // Uniqueness is practically handled by the INV-RANDOM generator in controller
    },
    orderItems: [{
        name: { type: String, required: true },
        qty: { type: Number, required: true },
        image: { type: String, required: true },
        price: { type: Number, required: true },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Product'
        },
        color: {
            type: String,
            required: false
        },
        returnStatus: {
            type: String,
            enum: ['NONE', 'REQUESTED', 'APPROVED', 'REJECTED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'REFUNDED', 'REPLACED', 'COMPLETED'],
            default: 'NONE'
        },
        returnRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ReturnRequest'
        }
    }],
    shippingAddress: {
        address: { type: String, required: true },
        city: { type: String, required: true },
        postalCode: { type: String, required: true },
        country: { type: String, required: true },
        phoneNumber: { type: String, required: true, trim: true }
    },
    paymentMethod: {
        type: String,
        required: true
    },
    paymentResult: { // Result from Stripe/Razorpay
        id: { type: String },
        status: { type: String },
        update_time: { type: String },
        email_address: { type: String }
    },
    taxPrice: {
        type: Number,
        required: true,
        default: 0.0
    },
    shippingPrice: {
        type: Number,
        required: true,
        default: 0.0
    },
    totalPrice: {
        type: Number,
        required: true,
        default: 0.0
    },
    status: {
        type: String,
        enum: ['CREATED', 'PAID', 'PAYMENT_FAILED', 'READY_TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'],
        default: 'CREATED',
        index: true
    },
    paymentInfo: {
        id: String,
        status: String,
        method: String // 'STRIPE', 'COD', 'PAYPAL'
    },
    cancellation: {
        reason: String,
        requestedAt: Date,
        approvedAt: Date,
        refundAmount: Number
    },
    courier: {
        name: String,
        trackingId: String,
        shippedAt: Date,
        labelUrl: String
    },
    // Legacy flags maintained for backward compatibility primarily, driven by status in new logic
    isPaid: {
        type: Boolean,
        required: true,
        default: false
    },
    paidAt: {
        type: Date
    },
    isDelivered: {
        type: Boolean,
        required: true,
        default: false
    },
    deliveredAt: {
        type: Date
    },
    isCancelled: {
        type: Boolean,
        required: true,
        default: false
    },
    cancelledAt: {
        type: Date
    },
    expectedDeliveryDate: {
        type: Date
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
