const express = require('express');
const router = express.Router();
const {
    // Seller endpoints
    getSellerFinancialDashboard,
    getSellerLedger,
    getSellerSettlements,

    // Admin endpoints
    getPendingSettlements,
    getAllSettlements,
    getSettlementStats,
    generateSettlement,
    approveSettlement,
    rejectSettlement,
    processSettlement,
    markSettlementPaid,
    getSettlementById,
    releaseHeldFunds,
    downloadSettlementPDF,
    getCommissionDashboard,
    getSellerEarningsSummary
} = require('../controllers/settlementController');

const { protect, seller, admin, superAdmin, finance } = require('../middleware/authMiddleware');

// ==================== SELLER ROUTES ====================
// @route   /api/settlements/...

// Get seller's financial dashboard
router.get('/dashboard', protect, seller, getSellerFinancialDashboard);

// Get seller's ledger transactions
router.get('/ledger', protect, seller, getSellerLedger);

// Get seller's settlement history
router.get('/history', protect, seller, getSellerSettlements);

// Get seller's earnings summary (real-time order-based)
router.get('/earnings-summary', protect, seller, getSellerEarningsSummary);

// ==================== ADMIN ROUTES ====================
// @route   /api/settlements/admin/...

// Get settlement stats (Admin) - Must be before /admin/:id route
router.get('/admin/stats', protect, admin, getSettlementStats);

// Get commission dashboard (Admin) - Must be before /admin/:id route
router.get('/admin/commission-dashboard', protect, admin, getCommissionDashboard);

// Get all pending settlements (Admin/Finance)
router.get('/admin/pending', protect, admin, getPendingSettlements);

// Get all settlements with filters (Admin/Finance)
router.get('/admin/all', protect, admin, getAllSettlements);
router.get('/admin', protect, admin, getAllSettlements);

// Generate settlement for a seller (Super Admin)
router.post('/admin/generate', protect, superAdmin, generateSettlement);

// Approve settlement (Super Admin)
router.put('/admin/:id/approve', protect, superAdmin, approveSettlement);

// Reject settlement (Super Admin)
router.put('/admin/:id/reject', protect, superAdmin, rejectSettlement);

// Process settlement payment (Finance/Admin)
router.put('/admin/:id/process', protect, admin, processSettlement);

// Mark settlement as paid (Finance/Admin)
router.put('/admin/:id/paid', protect, admin, markSettlementPaid);

// Release held funds (System/Cron)
router.post('/admin/release-holds', protect, superAdmin, releaseHeldFunds);

// ==================== SHARED ROUTES ====================

// Download settlement PDF
router.get('/:id/pdf', protect, downloadSettlementPDF);

// Get settlement details (Seller can view their own, Admin can view all)
router.get('/:id', protect, getSettlementById);

module.exports = router;


