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
    // Idempotency key to prevent duplicate orders
    // Index is created separately below with partialFilterExpression to allow null values
    idempotencyKey: {
        type: String,
        default: null
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
        // ============ SELLER ATTRIBUTION (NEW) ============
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Seller'
        },
        // Financial tracking per item
        itemTotal: {
            type: Number,  // price * qty
            default: 0
        },
        sellerShare: {
            type: Number,  // Amount after commission
            default: 0
        },
        platformCommission: {
            type: Number,  // Platform's cut
            default: 0
        },
        commissionRate: {
            type: Number,  // Commission % at time of order
            default: 10
        },
        taxAmount: {
            type: Number,  // GST/Tax on this item
            default: 0
        },
        // Settlement tracking
        settlementStatus: {
            type: String,
            enum: ['PENDING', 'ON_HOLD', 'ELIGIBLE', 'SETTLED'],
            default: 'PENDING'
        },
        settlementId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Settlement'
        },
        ledgerEntryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SellerLedger'
        },
        // ============ END SELLER ATTRIBUTION ============
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
    // Coupon tracking
    coupon: {
        code: String,
        discountPercentage: Number,
        discountAmount: Number
    },
    shippingAddress: {
        doorNumber: { type: String },
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

// ==================== TIER 1: DATABASE INDEXES FOR PAGINATION ====================
// These indexes are CRITICAL for fast paginated queries
orderSchema.index({ user: 1, createdAt: -1 });               // getMyOrders (paginated)
orderSchema.index({ status: 1, createdAt: -1 });              // getOrders with status filter
orderSchema.index({ isPaid: 1, createdAt: -1 });              // Payment-related queries
orderSchema.index({ 'orderItems.seller': 1, createdAt: -1 }); // Seller order queries
orderSchema.index({ 'orderItems.settlementStatus': 1 });       // Settlement queries

module.exports = mongoose.model('Order', orderSchema);

