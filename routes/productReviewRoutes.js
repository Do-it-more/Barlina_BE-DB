const express = require('express');
const router = express.Router();
const {
    getProductsForReview,
    getProductReviewById,
    approveProduct,
    rejectProduct,
    blockProduct,
    unblockProduct,
    requestProductChanges,
    getProductReviewStats,
    bulkApproveProducts,
    blockProductFix
} = require('../controllers/productReviewController');
const controller = require('../controllers/productReviewController');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');

// All routes require admin or super admin
router.use(protect);

// Stats
router.get('/stats', admin, getProductReviewStats);

// List and Details (Admin can view)
router.get('/', admin, getProductsForReview);
router.get('/:id', admin, getProductReviewById);

// Admin Actions (Approve, Reject, Request Changes)
router.put('/:id/approve', admin, approveProduct);
router.put('/:id/reject', admin, rejectProduct);
router.put('/:id/request-changes', admin, requestProductChanges);

// Super Admin Only Actions
router.put('/:id/block', superAdmin, blockProduct);
router.put('/:id/block-fix', superAdmin, controller.blockProductFix);
router.put('/:id/unblock', superAdmin, unblockProduct);
router.post('/bulk-approve', superAdmin, bulkApproveProducts);

module.exports = router;
