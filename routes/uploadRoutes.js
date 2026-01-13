const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');

router.post('/', upload.single('image'), (req, res) => {
    res.send(`/uploads/${req.file.filename}`);
});

router.post('/multiple', upload.array('files', 5), (req, res) => {
    const filePaths = req.files.map(file => `/uploads/${file.filename}`);
    res.send(filePaths);
});

module.exports = router;
