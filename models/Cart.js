const mongoose = require('mongoose');

const cartSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        name: { type: String, required: true },
        image: { type: String, required: true },
        price: { type: Number, required: true },
        countInStock: { type: Number, required: true },
        quantity: {
            type: Number,
            required: true,
            default: 1
        },
        color: {
            type: String,
            required: false
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Cart', cartSchema);
