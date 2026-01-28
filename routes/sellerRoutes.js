const express = require('express');
const router = express.Router();
const {
    registerSeller,
    getSellerProfile,
    updateSellerProfile,
    updateBankDetails,
    updateKYC,
    submitForReview,
    getSellerDashboardStats,
    getSellerProducts,
    createSellerProduct,
    updateSellerProduct,
    submitProductForReview,
    deleteSellerProduct,
    getSellerOrders
} = require('../controllers/sellerController');
const { protect, seller, approvedSeller, verifySellerOwnership } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Registration (any authenticated user can register as seller)
router.post('/register', registerSeller);

// Profile Management
router.get('/profile', seller, getSellerProfile);
router.put('/profile', seller, updateSellerProfile);
router.put('/bank', seller, updateBankDetails);
router.put('/kyc', seller, updateKYC);
router.post('/submit', seller, submitForReview);

// Dashboard
router.get('/dashboard/stats', seller, getSellerDashboardStats);

// Products (requires approved seller)
router.get('/products', seller, getSellerProducts);
router.post('/products', approvedSeller, createSellerProduct);
router.put('/products/:id', verifySellerOwnership('product'), updateSellerProduct);
router.post('/products/:id/submit', verifySellerOwnership('product'), submitProductForReview);
router.delete('/products/:id', verifySellerOwnership('product'), deleteSellerProduct);

// Orders
router.get('/orders', seller, getSellerOrders);

module.exports = router;
