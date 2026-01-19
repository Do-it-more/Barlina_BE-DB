const express = require('express');
const router = express.Router();
const {
    createComplaint,
    getMyComplaints,
    getComplaints,
    getComplaintById,
    updateComplaint,
    deleteComplaint,
    markComplaintsViewed
} = require('../controllers/complaintController');
const { protect, admin, checkPermission, superAdmin } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, createComplaint)
    .get(protect, checkPermission('complaints'), getComplaints);

router.route('/mark-viewed').put(protect, checkPermission('complaints'), markComplaintsViewed);

router.route('/mycomplaints').get(protect, getMyComplaints);

router.route('/:id')
    .get(protect, getComplaintById)
    .put(protect, checkPermission('complaints'), updateComplaint)
    .delete(protect, superAdmin, deleteComplaint);

module.exports = router;
