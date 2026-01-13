const mongoose = require('mongoose');

const auditLogSchema = mongoose.Schema({
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false,
        ref: 'Order',
        index: true
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false
    },
    targetModel: {
        type: String,
        required: false
    },
    statusFrom: {
        type: String,
        required: false
    },
    statusTo: {
        type: String,
        required: false
    },
    action: {
        type: String,
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Fallback if performedBy isn't used
    },
    performedBy: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User'
        },
        name: { type: String, required: true },
        role: { type: String, required: true }
    },
    details: {
        type: String,
        required: false
    },
    reason: {
        type: String,
        required: false
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        required: false
    },
    note: {
        type: String,
        required: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
