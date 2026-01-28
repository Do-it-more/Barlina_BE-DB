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
    },
    isSpecialOffersEnabled: {
        type: Boolean,
        default: true
    },
    // Company Information
    companyName: { type: String, default: 'Barlina Fashion Design' },
    companyEmail: { type: String, default: 'support@barlina.com' },
    companyPhone: { type: String, default: '+91 9876543210' },
    companyAddress: {
        doorNo: { type: String, default: '' },
        street: { type: String, default: '' },
        city: { type: String, default: '' },
        district: { type: String, default: '' },
        state: { type: String, default: '' },
        pincode: { type: String, default: '' }
    },
    companyGST: { type: String, default: '22AAAAA0000A1Z5' },
    companyPAN: { type: String, default: 'AAAAA0000A' },

    // Finance Settings
    currency: { type: String, default: 'INR' },

    // Payment Gateway Configuration
    paymentGateways: {
        activeGateway: { type: String, enum: ['cashfree', 'instamojo'], default: 'cashfree' },
        cashfree: {
            isActive: { type: Boolean, default: true },
            appId: { type: String, default: '' }, // Client ID
            secretKey: { type: String, default: '' }, // Client Secret
            isProduction: { type: Boolean, default: false }
        },
        instamojo: {
            isActive: { type: Boolean, default: false },
            apiKey: { type: String, default: '' },
            authToken: { type: String, default: '' },
            isProduction: { type: Boolean, default: false }
        }
    },

    // Notifictions configuration
    emailNotifications: { type: Boolean, default: true },
    lowBalanceAlert: { type: Boolean, default: false },
    lowBalanceThreshold: { type: Number, default: 10000 },

    // Tax and Shipping Control
    gstEnabled: { type: Boolean, default: true },
    gstRate: { type: Number, default: 18, min: 0 },
    tdsEnabled: { type: Boolean, default: false },
    tdsRate: { type: Number, default: 10, min: 0 },
    shippingCharge: { type: Number, default: 50, min: 0 },
    freeShippingThreshold: { type: Number, default: 1000, min: 0 }
}, {
    timestamps: true
});

module.exports = mongoose.model('Setting', settingSchema);
