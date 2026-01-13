const mongoose = require('mongoose');

const verificationSchema = mongoose.Schema({
    identifier: {
        type: String,
        required: true,
        unique: true
    },
    otp: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        expires: 600
    }
}, {
    timestamps: true
});



module.exports = mongoose.model('Verification', verificationSchema);
