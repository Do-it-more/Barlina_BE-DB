const asyncHandler = require('express-async-handler');
const Notification = require('../models/Notification');

// @desc    Get my notifications
// @route   GET /api/notifications
// @access  Private
const getMyNotifications = asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ recipient: req.user._id })
        .sort({ createdAt: -1 })
        .limit(20); // Limit to last 20

    const unreadCount = await Notification.countDocuments({
        recipient: req.user._id,
        isRead: false
    });

    res.json({ notifications, unreadCount });
});

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = asyncHandler(async (req, res) => {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
        res.status(404);
        throw new Error('Notification not found');
    }

    // Verify ownership
    if (notification.recipient.toString() !== req.user._id.toString()) {
        res.status(401);
        throw new Error('Not authorized');
    }

    notification.isRead = true;
    await notification.save();

    res.json(notification);
});

// @desc    Mark ALL notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = asyncHandler(async (req, res) => {
    await Notification.updateMany(
        { recipient: req.user._id, isRead: false },
        { $set: { isRead: true } }
    );

    res.json({ message: 'All notifications marked as read' });
});

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = asyncHandler(async (req, res) => {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
        res.status(404);
        throw new Error('Notification not found');
    }

    if (notification.recipient.toString() !== req.user._id.toString()) {
        res.status(401);
        throw new Error('Not authorized');
    }

    await notification.deleteOne();
    res.json({ message: 'Notification removed' });
});

// Internal Helper to Create Notification
const createNotification = async ({ recipient, type, title, message, link, metadata }) => {
    try {
        await Notification.create({
            recipient,
            type,
            title,
            message,
            link,
            metadata
        });
        // Note: In a real app, you might emit a Socket.IO event here too
    } catch (error) {
        console.error("Failed to create notification:", error);
    }
};

module.exports = {
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    createNotification // Export helper for use in other controllers
};
