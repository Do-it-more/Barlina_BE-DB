const mongoose = require('mongoose');

const notificationSchema = mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String, // ORDER, SYSTEM, PAYMENT, ALERT, INFO
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    link: {
        type: String, // Optional URL to navigate to
        default: null
    },
    isRead: {
        type: Boolean,
        default: false
    },
    metadata: {
        type: Object, // Flexible field for extra data (orderId, etc.)
        default: {}
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);
