const multer = require('multer');
const path = require('path');

const fs = require('fs');

const storage = multer.diskStorage({
    destination(req, file, cb) {
        const uploadPath = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename(req, file, cb) {
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    },
});

function checkFileType(file, cb) {
    // Allow images, videos, and PDF documents for KYC
    const filetypes = /jpg|jpeg|png|gif|pdf|mp4|mov|webm|mkv|quicktime/;
    const mimetypes = /image\/(jpeg|jpg|png|gif)|video\/(mp4|mov|webm|mkv|quicktime)|application\/pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = mimetypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error(`File type not allowed. Got: ${file.mimetype}, Ext: ${path.extname(file.originalname)}`));
    }
}

const upload = multer({
    storage,
    limits: { fileSize: 100000000 }, // 100MB limit
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    },
});

module.exports = upload;
