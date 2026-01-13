const express = require('express');
const router = express.Router();
const {
    createComplaint,
    getMyComplaints,
    getComplaints,
    getComplaintById,
    updateComplaint
} = require('../controllers/complaintController');
const { protect, admin, checkPermission } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, createComplaint)
    .get(protect, checkPermission('complaints'), getComplaints);

router.route('/mycomplaints').get(protect, getMyComplaints);

router.route('/:id')
    .get(protect, getComplaintById)
    .put(protect, checkPermission('complaints'), updateComplaint);

module.exports = router;
