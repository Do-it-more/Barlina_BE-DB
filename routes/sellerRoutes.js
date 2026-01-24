const express = require('express');
const router = express.Router();
const {
    registerSeller,
    getSellerProfile,
    updateBankDetails,
    updateKYC,
    getSellerDashboardStats
} = require('../controllers/sellerController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', protect, registerSeller);
router.get('/profile', protect, getSellerProfile);
router.get('/dashboard/stats', protect, getSellerDashboardStats);
router.put('/bank', protect, updateBankDetails);
router.put('/kyc', protect, updateKYC);

module.exports = router;
