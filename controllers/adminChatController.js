const AdminMessage = require('../models/AdminMessage');
const User = require('../models/User');

// @desc    Get chat history
// @route   GET /api/admin/chat
// @access  Private/Admin
const getMessages = async (req, res) => {
    try {
        const messages = await AdminMessage.find({})
            .populate('sender', 'name profilePhoto role')
            .sort({ createdAt: 1 })
            .limit(100); // Limit to last 100 messages for performance

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Save a new message
// @route   POST /api/admin/chat
// @access  Private/Admin
const sendMessage = async (req, res) => {
    const { content } = req.body;
    let attachments = [];

    if (req.files && req.files.length > 0) {
        attachments = req.files.map(file => `/uploads/${file.filename}`);
    }

    if (!content && attachments.length === 0) {
        return res.status(400).json({ message: 'Message content or attachment is required' });
    }

    try {
        const newMessage = await AdminMessage.create({
            sender: req.user._id,
            content: content || '', // Allow empty content if attachments exist
            attachments
        });

        const fullMessage = await AdminMessage.findById(newMessage._id).populate('sender', 'name profilePhoto role');

        res.status(201).json(fullMessage);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { getMessages, sendMessage };
