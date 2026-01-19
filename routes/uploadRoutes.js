const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');

router.post('/', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }
    res.send(`/uploads/${req.file.filename}`);
});

router.post('/multiple', upload.array('files', 5), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
    }
    const filePaths = req.files.map(file => `/uploads/${file.filename}`);
    res.send(filePaths);
});

module.exports = router;
