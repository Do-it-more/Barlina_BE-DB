const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');

// Single file upload with error handling
router.post('/', (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            console.error('[UPLOAD ERROR]', err.message);
            return res.status(400).json({ message: err.message || 'Upload failed' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        console.log('[UPLOAD SUCCESS]', req.file.filename);
        res.json({ url: `/uploads/${req.file.filename}` });
    });
});

router.post('/multiple', upload.array('files', 5), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
    }
    const filePaths = req.files.map(file => `/uploads/${file.filename}`);
    res.json({ urls: filePaths });
});

module.exports = router;

