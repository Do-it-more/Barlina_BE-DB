const asyncHandler = require('express-async-handler');
const SupportTicket = require('../models/SupportTicket');
const Seller = require('../models/Seller');

// @desc    Create a new support ticket
// @route   POST /api/sellers/support-tickets
// @access  Private (Seller)
const createSupportTicket = asyncHandler(async (req, res) => {
    const { subject, category, message } = req.body;
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    const ticket = await SupportTicket.create({
        seller: seller._id,
        ticketId: `TKT-${Date.now().toString().slice(-6)}`,
        subject,
        category,
        message
    });

    res.status(201).json(ticket);
});

// @desc    Get seller's support tickets
// @route   GET /api/sellers/support-tickets
// @access  Private (Seller)
const getSupportTickets = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    const tickets = await SupportTicket.find({ seller: seller._id }).sort({ createdAt: -1 });

    res.json({ tickets });
});

module.exports = {
    createSupportTicket,
    getSupportTickets
};
