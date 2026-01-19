const mongoose = require('mongoose');

const adminChatSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['private', 'group'],
        default: 'private'
    },
    members: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        // Timestamps to support "Clear Chat" without deleting data
        clearedAt: { type: Date, default: null },
        isAdmin: { type: Boolean, default: false } // Helper for quick role checks if needed
    }],
    // Group Chat Specifics
    groupName: { type: String },
    groupDescription: { type: String },
    groupAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // The SuperAdmin who owns it
    groupAvatar: { type: String },

    // UI Optimization
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminMessage' },
    lastMessageAt: { type: Date, default: Date.now },

}, { timestamps: true });

// Index for valid permission queries
adminChatSchema.index({ "members.user": 1, lastMessageAt: -1 });

module.exports = mongoose.model('AdminChat', adminChatSchema);
