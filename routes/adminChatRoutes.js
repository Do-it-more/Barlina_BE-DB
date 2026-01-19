const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, admin } = require('../middleware/authMiddleware');
const {
    getChats,
    getMessages,
    sendMessage,
    initChat,
    createGroupChat,
    clearChat,
    deleteMessage,
    markChatRead,
    deleteChat
} = require('../controllers/adminChatController');

// Multer Storage for Multimedia
const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, 'uploads/');
    },
    filename(req, file, cb) {
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    },
});

const checkFileType = (file, cb) => {
    // Allowed extensions
    const filetypes = /jpg|jpeg|png|webp|mp4|webm|mp3|wav|pdf|doc|docx|xls|xlsx/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb('Error: Multimedia Files Only!');
    }
};

const upload = multer({
    storage,
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    },
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Routes
router.get('/rooms', protect, admin, getChats);
router.post('/init', protect, admin, initChat);
router.post('/group', protect, admin, createGroupChat);
router.get('/:id/messages', protect, admin, getMessages);
router.post('/send', protect, admin, upload.single('file'), sendMessage);
router.post('/:id/clear', protect, admin, clearChat);
router.put('/:id/read', protect, admin, markChatRead);
router.delete('/message/:id', protect, admin, deleteMessage);
router.delete('/:id', protect, admin, deleteChat);

module.exports = router;
