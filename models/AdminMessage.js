const mongoose = require('mongoose');

const adminMessageSchema = new mongoose.Schema({
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminChat',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderRole: {
        type: String,
        enum: ['admin', 'super_admin', 'finance', 'seller_admin'],
        required: true
    },
    content: { type: String, default: "" },
    contentType: {
        type: String,
        enum: ['text', 'image', 'video', 'audio', 'document'],
        default: 'text'
    },
    // Multimedia
    fileUrl: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },

    // Read Receipts
    // We store who read it. Delivered status is often implied by socket ack, 
    // but in persistent DB we stick to "Read By".
    readBy: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now }
    }],

    // Deletion Logic
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Soft delete for Admins
    isDeletedGlobally: { type: Boolean, default: false }, // SuperAdmin hard delete
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who performed the global delete

    // Edit Logic
    isEdited: { type: Boolean, default: false }

}, { timestamps: true });

// Index for fetching chat history efficiently
adminMessageSchema.index({ chat: 1, createdAt: 1 });

module.exports = mongoose.model('AdminMessage', adminMessageSchema);
