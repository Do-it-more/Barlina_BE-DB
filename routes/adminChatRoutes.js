const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, admin, chatAccess } = require('../middleware/authMiddleware');
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
router.get('/rooms', protect, chatAccess, getChats);
router.post('/init', protect, chatAccess, initChat);
router.post('/group', protect, chatAccess, createGroupChat);
router.get('/:id/messages', protect, chatAccess, getMessages);
router.post('/send', protect, chatAccess, upload.single('file'), sendMessage);
router.post('/:id/clear', protect, chatAccess, clearChat);
router.put('/:id/read', protect, chatAccess, markChatRead);
router.delete('/message/:id', protect, chatAccess, deleteMessage);
router.delete('/:id', protect, chatAccess, deleteChat);

module.exports = router;
