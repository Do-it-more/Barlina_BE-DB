const express = require('express');
const router = express.Router();
const {
    getAllSellers,
    getSellerById,
    reviewSeller,
    approveSeller,
    rejectSeller,
    suspendSeller,
    activateSeller,
    updateCommission,
    updatePayoutStatus,
    getSellerStats,
    blockSeller
} = require('../controllers/sellerAdminController');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');

// All routes require admin or super admin
router.use(protect);

// Stats
router.get('/stats', admin, getSellerStats);

// List and Details (Admin can view)
router.get('/', admin, getAllSellers);
router.get('/:id', admin, getSellerById);

// Admin Actions (Review, request changes)
router.put('/:id/review', admin, reviewSeller);
router.put('/:id/reject', admin, rejectSeller);

// Super Admin Only Actions
router.put('/:id/approve', superAdmin, approveSeller);
router.put('/:id/suspend', superAdmin, suspendSeller);
router.put('/:id/activate', superAdmin, activateSeller);
router.put('/:id/commission', superAdmin, updateCommission);
router.put('/:id/payout-status', superAdmin, updatePayoutStatus);
router.put('/:id/block', superAdmin, blockSeller);

module.exports = router;
