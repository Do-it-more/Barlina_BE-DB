const express = require('express');
const { submitContact, getContacts, deleteContact, markContactsRead } = require('../controllers/contactController');
const { protect, admin, checkPermission } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
    .post(submitContact)
    .get(protect, checkPermission('inquiries'), getContacts);

router.route('/mark-read').put(protect, checkPermission('inquiries'), markContactsRead);

router.route('/:id')
    .delete(protect, checkPermission('inquiries'), deleteContact);

module.exports = router;
