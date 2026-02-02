const asyncHandler = require('express-async-handler');
const SupportTicket = require('../models/SupportTicket');
const Seller = require('../models/Seller');

// @desc    Get all support tickets (Admin)
// @route   GET /api/admin/support-tickets
// @access  Private/Admin
const getAllTickets = asyncHandler(async (req, res) => {
    const { status, category, search, page = 1, limit = 20 } = req.query;

    const filter = {};

    if (status) {
        filter.status = status;
    }

    if (category) {
        filter.category = category;
    }

    if (search) {
        filter.$or = [
            { ticketId: { $regex: search, $options: 'i' } },
            { subject: { $regex: search, $options: 'i' } }
        ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [tickets, totalCount] = await Promise.all([
        SupportTicket.find(filter)
            .populate('seller', 'businessName ownerName email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit)),
        SupportTicket.countDocuments(filter)
    ]);

    res.json({
        tickets,
        page: parseInt(page),
        pages: Math.ceil(totalCount / parseInt(limit)),
        total: totalCount
    });
});

// @desc    Get single ticket details (Admin)
// @route   GET /api/admin/support-tickets/:id
// @access  Private/Admin
const getTicketById = asyncHandler(async (req, res) => {
    const ticket = await SupportTicket.findById(req.params.id)
        .populate('seller', 'businessName ownerName email phone');

    if (!ticket) {
        res.status(404);
        throw new Error('Ticket not found');
    }

    res.json(ticket);
});

// @desc    Reply to a ticket (Admin)
// @route   PUT /api/admin/support-tickets/:id/reply
// @access  Private/Admin
const replyToTicket = asyncHandler(async (req, res) => {
    const { response, status } = req.body;

    if (!response) {
        res.status(400);
        throw new Error('Response message is required');
    }

    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
        res.status(404);
        throw new Error('Ticket not found');
    }

    ticket.response = response;
    // Default to RESOLVED if not specified, but allow admin to set other status
    ticket.status = status || 'RESOLVED';
    ticket.updatedAt = Date.now();

    const updatedTicket = await ticket.save();

    res.json(updatedTicket);
});

// @desc    Update ticket status (Admin)
// @route   PUT /api/admin/support-tickets/:id/status
// @access  Private/Admin
const updateTicketStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;

    if (!status) {
        res.status(400);
        throw new Error('Status is required');
    }

    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
        res.status(404);
        throw new Error('Ticket not found');
    }

    ticket.status = status;
    ticket.updatedAt = Date.now();

    const updatedTicket = await ticket.save();

    res.json(updatedTicket);
});

module.exports = {
    getAllTickets,
    getTicketById,
    replyToTicket,
    updateTicketStatus
};
