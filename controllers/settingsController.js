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
    const { isCodAvailable, defaultEstimatedDeliveryDays } = req.body;

    let settings = await Setting.findOne();
    if (!settings) {
        settings = await Setting.create({ isCodAvailable: true, defaultEstimatedDeliveryDays: 5 });
    }

    if (isCodAvailable !== undefined) {
        settings.isCodAvailable = isCodAvailable;
    }

    if (defaultEstimatedDeliveryDays !== undefined) {
        settings.defaultEstimatedDeliveryDays = defaultEstimatedDeliveryDays;
    }

    if (req.body.areReturnsActive !== undefined) {
        settings.areReturnsActive = req.body.areReturnsActive;
    }

    if (req.body.isChatbotEnabled !== undefined) {
        settings.isChatbotEnabled = req.body.isChatbotEnabled;
    }

    if (req.body.isGlobalStockActive !== undefined) {
        settings.isGlobalStockActive = req.body.isGlobalStockActive;
    }

    if (req.body.isStockCountVisible !== undefined) {
        settings.isStockCountVisible = req.body.isStockCountVisible;
    }

    const updatedSettings = await settings.save();
    res.json(updatedSettings);
});

module.exports = {
    getSettings,
    updateSettings
};
