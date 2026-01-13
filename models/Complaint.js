const mongoose = require('mongoose');

const complaintSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Order'
    },
    subject: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    images: [{
        type: String
    }],
    video: {
        type: String
    },
    status: {
        type: String,
        required: true,
        default: 'Open',
        enum: ['Open', 'In Progress', 'Resolved', 'Closed']
    },
    adminResponse: {
        type: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Complaint', complaintSchema);
