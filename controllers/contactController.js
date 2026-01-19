const Contact = require('../models/Contact');

// @desc    Submit a contact form
// @route   POST /api/contact
// @access  Public
const submitContact = async (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
        return res.status(400).json({ message: 'Please fill in all fields' });
    }

    try {
        const contact = await Contact.create({
            name,
            email,
            subject,
            message
        });
        res.status(201).json(contact);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get all contact inquiries
// @route   GET /api/contact
// @access  Private/Admin
const getContacts = async (req, res) => {
    try {
        const contacts = await Contact.find({}).sort({ createdAt: -1 });
        res.json(contacts);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete a contact inquiry
// @route   DELETE /api/contact/:id
// @access  Private/Admin
const deleteContact = async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id);

        if (contact) {
            await contact.deleteOne();
            res.json({ message: 'Contact inquiry removed' });
        } else {
            res.status(404).json({ message: 'Contact inquiry not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Mark all new contacts as read
// @route   PUT /api/contact/mark-read
// @access  Private/Admin
const markContactsRead = async (req, res) => {
    try {
        await Contact.updateMany({ status: 'New' }, { status: 'Read' });
        res.json({ message: 'All contacts marked as read' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { submitContact, getContacts, deleteContact, markContactsRead };
