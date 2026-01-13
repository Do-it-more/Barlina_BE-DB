const express = require('express');
const router = express.Router();
const { getMessages, sendMessage } = require('../controllers/adminChatController');
const { protect, admin } = require('../middleware/authMiddleware');

const upload = require('../middleware/uploadMiddleware');

router.get('/', protect, admin, getMessages);
router.post('/', protect, admin, upload.array('files', 5), sendMessage);

module.exports = router;
