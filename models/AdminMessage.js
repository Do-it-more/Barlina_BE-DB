const mongoose = require('mongoose');

const adminMessageSchema = mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: false // Content can be empty if there are attachments
    },
    attachments: [{
        type: String // URLs to images/videos
    }],
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('AdminMessage', adminMessageSchema);
