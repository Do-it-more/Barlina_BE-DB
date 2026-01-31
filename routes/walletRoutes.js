const express = require('express');
const router = express.Router();
const { getWallet, creditWallet, topUpWallet, initiateWalletTopup, verifyWalletTopup } = require('../controllers/walletController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/', protect, getWallet);
router.post('/credit', protect, admin, creditWallet);
router.post('/topup', protect, topUpWallet);
router.post('/initiate-topup', protect, initiateWalletTopup);
router.post('/verify-topup', protect, verifyWalletTopup);

module.exports = router;
