const asyncHandler = require('express-async-handler');
const User = require('../models/User');

// @desc    Get user addresses
// @route   GET /api/users/addresses
// @access  Private
const getAddresses = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        // Migration: If no addresses in array but legacy address exists, move it
        if ((!user.addresses || user.addresses.length === 0) && user.address && user.address.street) {
            user.addresses = [{
                label: 'Home (Default)',
                street: user.address.street,
                city: user.address.city,
                state: user.address.state,
                postalCode: user.address.postalCode,
                country: user.address.country,
                phoneNumber: user.phoneNumber || user.address.phoneNumber,
                isDefault: true
            }];
            await user.save();
        }

        res.json(user.addresses);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Add new address
// @route   POST /api/users/addresses
// @access  Private
const addAddress = asyncHandler(async (req, res) => {
    const { label, street, city, state, postalCode, country, phoneNumber, isDefault } = req.body;

    const user = await User.findById(req.user._id);

    if (user) {
        if (isDefault) {
            // Unset other defaults
            user.addresses.forEach(a => { a.isDefault = false; });
        } else if (user.addresses.length === 0) {
            // First address is always default
            req.body.isDefault = true;
        }

        user.addresses.push({ label, street, city, state, postalCode, country, phoneNumber, isDefault: req.body.isDefault });
        await user.save();

        res.status(201).json(user.addresses);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Update address
// @route   PUT /api/users/addresses/:id
// @access  Private
const updateAddress = asyncHandler(async (req, res) => {
    const { label, street, city, state, postalCode, country, phoneNumber, isDefault } = req.body;

    const user = await User.findById(req.user._id);

    if (user) {
        const address = user.addresses.id(req.params.id);

        if (address) {
            if (isDefault) {
                user.addresses.forEach(a => { a.isDefault = false; });
            }

            address.label = label || address.label;
            address.street = street || address.street;
            address.city = city || address.city;
            address.state = state || address.state;
            address.postalCode = postalCode || address.postalCode;
            address.country = country || address.country;
            address.phoneNumber = phoneNumber || address.phoneNumber;
            address.isDefault = isDefault !== undefined ? isDefault : address.isDefault;

            await user.save();
            res.json(user.addresses);
        } else {
            res.status(404);
            throw new Error('Address not found');
        }
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Delete address
// @route   DELETE /api/users/addresses/:id
// @access  Private
const deleteAddress = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        user.addresses = user.addresses.filter(a => a._id.toString() !== req.params.id);

        // Ensure at least one default if addresses exist
        if (user.addresses.length > 0 && !user.addresses.find(a => a.isDefault)) {
            user.addresses[0].isDefault = true;
        }

        await user.save();
        res.json(user.addresses);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

module.exports = {
    getAddresses,
    addAddress,
    updateAddress,
    deleteAddress
};
