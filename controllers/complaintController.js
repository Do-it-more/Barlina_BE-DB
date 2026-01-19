const asyncHandler = require('express-async-handler');
const Complaint = require('../models/Complaint');

// @desc    Create a new complaint
// @route   POST /api/complaints
// @access  Private
const createComplaint = asyncHandler(async (req, res) => {
    const { orderId, subject, description, images, video } = req.body;

    const complaint = new Complaint({
        user: req.user._id,
        order: orderId,
        subject,
        description,
        images,
        video,
        status: 'Open'
    });

    const createdComplaint = await complaint.save();
    res.status(201).json(createdComplaint);
});

// @desc    Get logged in user complaints
// @route   GET /api/complaints/mycomplaints
// @access  Private
const getMyComplaints = asyncHandler(async (req, res) => {
    const complaints = await Complaint.find({ user: req.user._id }).populate('order', '_id').sort({ createdAt: -1 });
    res.json(complaints);
});

// @desc    Get all complaints (Admin)
// @route   GET /api/complaints
// @access  Private/Admin
const getComplaints = asyncHandler(async (req, res) => {
    const complaints = await Complaint.find({}).populate('user', 'id name email').populate('order', '_id createdAt').sort({ createdAt: -1 });
    res.json(complaints);
});

// @desc    Get complaint by ID
// @route   GET /api/complaints/:id
// @access  Private
const getComplaintById = asyncHandler(async (req, res) => {
    const complaint = await Complaint.findById(req.params.id)
        .populate('user', 'name email')
        .populate('order');

    if (complaint) {
        // Ensure user owns complaint or is admin
        if ((complaint.user && complaint.user._id.toString() === req.user._id.toString()) || req.user.role === 'admin' || req.user.role === 'super_admin') {
            res.json(complaint);
        } else {
            res.status(401);
            throw new Error('Not authorized');
        }
    } else {
        res.status(404);
        throw new Error('Complaint not found');
    }
});

// @desc    Update complaint (Admin reply/status)
// @route   PUT /api/complaints/:id
// @access  Private/Admin
const updateComplaint = asyncHandler(async (req, res) => {
    const complaint = await Complaint.findById(req.params.id);

    if (complaint) {
        complaint.status = req.body.status || complaint.status;
        complaint.adminResponse = req.body.adminResponse || complaint.adminResponse;

        const updatedComplaint = await complaint.save();
        res.json(updatedComplaint);
    } else {
        res.status(404);
        throw new Error('Complaint not found');
    }
});

// @desc    Delete complaint
// @route   DELETE /api/complaints/:id
// @access  Private/SuperAdmin
const deleteComplaint = asyncHandler(async (req, res) => {
    const complaint = await Complaint.findById(req.params.id);

    if (complaint) {
        if (complaint.status !== 'Closed') {
            res.status(400);
            throw new Error('Only Closed complaints can be deleted');
        }

        await complaint.deleteOne();
        res.json({ message: 'Complaint removed' });
    } else {
        res.status(404);
        throw new Error('Complaint not found');
    }
});

const markComplaintsViewed = asyncHandler(async (req, res) => {
    await Complaint.updateMany({ isViewedByAdmin: false }, { isViewedByAdmin: true });
    res.json({ message: 'Complaints marked as viewed' });
});

module.exports = {
    createComplaint,
    getMyComplaints,
    getComplaints,
    getComplaintById,
    updateComplaint,
    deleteComplaint,
    markComplaintsViewed
};
