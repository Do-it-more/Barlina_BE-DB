const mongoose = require('mongoose');

const settingSchema = mongoose.Schema({
    isCodAvailable: {
        type: Boolean,
        default: true
    },
    defaultEstimatedDeliveryDays: {
        type: Number,
        default: 5
    },
    areReturnsActive: {
        type: Boolean,
        default: true
    },
    isChatbotEnabled: {
        type: Boolean,
        default: true
    },
    isGlobalStockActive: {
        type: Boolean,
        default: true
    },
    isStockCountVisible: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Setting', settingSchema);
