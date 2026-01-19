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

const productSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User' // To track which admin created the product
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
    reviews: [reviewSchema], // Added reviews array
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
        type: String // We will store hex codes or names
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
    }
}, {
    timestamps: true
});

// OPTIMIZATION: Indexes for faster search and filtering
productSchema.index({ name: 'text', description: 'text', brand: 'text' }); // Full-Text Search
productSchema.index({ category: 1 }); // Filter by Category
productSchema.index({ price: 1 });    // Sort/Filter by Price
productSchema.index({ rating: -1 });  // Sort by Rating (High to Low)
productSchema.index({ createdAt: -1 }); // Sort by Newest

module.exports = mongoose.model('Product', productSchema);
