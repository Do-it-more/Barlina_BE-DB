const asyncHandler = require('express-async-handler');
const Setting = require('../models/Setting');
const cache = require('../services/cacheService');

// @desc    Get store settings
// @route   GET /api/settings
// @access  Public
// TIER 2: Cached — This endpoint is called by EVERY product card
const getSettings = asyncHandler(async (req, res) => {
    // Cache-aside: Check cache first, fetch from DB on miss
    const settings = await cache.getOrSet(
        cache.KEYS.SETTINGS,
        async () => {
            let dbSettings = await Setting.findOne().lean();
            if (!dbSettings) {
                dbSettings = await Setting.create({ isCodAvailable: true, defaultEstimatedDeliveryDays: 5 });
                return dbSettings.toObject();
            }
            return dbSettings;
        },
        600 // Cache for 10 minutes — settings rarely change
    );

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

    // TIER 2: Invalidate settings cache after update
    await cache.del(cache.KEYS.SETTINGS);

    res.json(updatedSettings);
});

module.exports = {
    getSettings,
    updateSettings
};
