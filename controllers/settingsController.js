const asyncHandler = require('express-async-handler');
const Setting = require('../models/Setting');

// @desc    Get store settings
// @route   GET /api/settings
// @access  Public
const getSettings = asyncHandler(async (req, res) => {
    let settings = await Setting.findOne();
    if (!settings) {
        settings = await Setting.create({ isCodAvailable: true, defaultEstimatedDeliveryDays: 5 });
    }
    res.json(settings);
});

// @desc    Update store settings
// @route   PUT /api/settings
// @access  Private/Admin
const updateSettings = asyncHandler(async (req, res) => {
    let settings = await Setting.findOne();
    if (!settings) {
        settings = await Setting.create({});
    }

    const fieldsToUpdate = [
        'isCodAvailable', 'defaultEstimatedDeliveryDays',
        'areReturnsActive', 'isChatbotEnabled', 'isGlobalStockActive',
        'isStockCountVisible', 'isSpecialOffersEnabled',
        'companyName', 'companyEmail', 'companyPhone', 'companyAddress',
        'companyGST', 'companyPAN',
        'currency', 'emailNotifications', 'lowBalanceAlert', 'lowBalanceThreshold',
        'paymentGateways',
        'gstEnabled', 'gstRate', 'tdsEnabled', 'tdsRate', 'shippingCharge', 'freeShippingThreshold'
    ];

    fieldsToUpdate.forEach(field => {
        if (req.body[field] !== undefined) {
            // Prevent negative values for specific numeric fields
            if (['gstRate', 'tdsRate', 'shippingCharge', 'freeShippingThreshold'].includes(field)) {
                settings[field] = Math.max(0, req.body[field]);
            } else {
                settings[field] = req.body[field];
            }
        }
    });

    const updatedSettings = await settings.save();
    res.json(updatedSettings);
});

module.exports = {
    getSettings,
    updateSettings
};
