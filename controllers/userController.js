const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Order = require('../models/Order');
const Complaint = require('../models/Complaint');
const Contact = require('../models/Contact');
const ReturnRequest = require('../models/ReturnRequest');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
    const users = await User.find({});
    res.json(users);
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password');
    if (user) {
        res.json(user);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        user.name = req.body.name || user.name;

        if (req.body.email && req.body.email !== user.email) {
            const emailExists = await User.findOne({ email: req.body.email });
            if (emailExists) {
                res.status(400);
                throw new Error('Email already in use');
            }
            user.email = req.body.email;
        }

        user.role = req.body.role || user.role;

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        await user.deleteOne();
        res.json({ message: 'User removed' });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Create a user (Admin)
// @route   POST /api/users/admin/create
// @access  Private/Admin
const createUser = asyncHandler(async (req, res) => {
    const { name, email, password, role, phoneNumber } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    const user = await User.create({
        name,
        email,
        password,
        role: role || 'user',
        phoneNumber,
        isEmailVerified: true, // Assuming admins create verified users
        isPhoneVerified: true,
        isFirstLogin: true // Force password change on first login
    });

    if (user) {
        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

// @desc    Get user full details (Aggregated)
// @route   GET /api/users/:id/full-details
// @access  Private/SuperAdmin
const getUserFullDetails = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Fetch related data in parallel
    const [orders, complaints, returns, inquiries] = await Promise.all([
        Order.find({ user: user._id }).sort({ createdAt: -1 }),
        Complaint.find({ user: user._id }).sort({ createdAt: -1 }),
        ReturnRequest.find({ user: user._id }).sort({ createdAt: -1 }), // Assuming ReturnRequest has user field
        Contact.find({ email: user.email }).sort({ createdAt: -1 })
    ]);

    res.json({
        user,
        orders,
        complaints,
        returns,
        inquiries
    });
});

module.exports = {
    getUsers,
    deleteUser,
    getUserById,
    updateUser,
    updateUser,
    createUser,
    getUserFullDetails
};
