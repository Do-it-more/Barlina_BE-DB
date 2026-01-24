const express = require('express');
const router = express.Router();
const {
    getFinancialStats,
    getFinancialRecords,
    addFinancialRecord,
    deleteFinancialRecord
} = require('../controllers/financialController');
const { protect, admin, finance, checkPermission } = require('../middleware/authMiddleware');

const hasFinanceAccess = (req, res, next) => {
    if (req.user && (req.user.role === 'finance' || req.user.role === 'super_admin')) {
        return next();
    }
    // Fallback to legacy Admin with Permission logic
    if (req.user && req.user.role === 'admin' && req.user.permissions?.finance) {
        return next();
    }
    res.status(403);
    throw new Error('Not authorized to access finance records');
};

router.route('/')
    .get(protect, hasFinanceAccess, getFinancialRecords)
    .post(protect, hasFinanceAccess, addFinancialRecord);

router.route('/stats')
    .get(protect, hasFinanceAccess, getFinancialStats);

router.route('/:id')
    .delete(protect, hasFinanceAccess, deleteFinancialRecord);

module.exports = router;
