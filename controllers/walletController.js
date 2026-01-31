const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const Setting = require('../models/Setting');
const axios = require('axios');

const Razorpay = require('razorpay');
const crypto = require('crypto');

// Helper to get Razorpay Instance
const getRazorpayInstance = async () => {
    const settings = await Setting.findOne();
    const config = settings?.paymentGateways?.razorpay;

    const keyId = config?.keyId || process.env.RAZORPAY_KEY_ID;
    const keySecret = config?.keySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials not found in Settings or .env');
    }

    return {
        instance: new Razorpay({
            key_id: keyId,
            key_secret: keySecret
        }),
        keyId,
        keySecret
    };
};

// @desc    Get user wallet balance and history
// @route   GET /api/wallet
// @access  Private
const getWallet = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    const transactions = await WalletTransaction.find({ user: req.user._id }).sort({ createdAt: -1 });

    res.json({
        balance: user.walletBalance || 0,
        transactions
    });
});

// @desc    Add money to wallet (Admin/Mock for now) or Refund
// @route   POST /api/wallet/add
// @access  Private/Admin (or verified internal call)
const creditWallet = asyncHandler(async (req, res) => {
    const { userId, amount, description, referenceId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    user.walletBalance = (user.walletBalance || 0) + Number(amount);
    await user.save();

    await WalletTransaction.create({
        user: userId,
        amount,
        type: 'CREDIT',
        description,
        referenceId,
        status: 'COMPLETED'
    });

    res.json({ message: 'Wallet credited successfully', balance: user.walletBalance });
});

// @desc    Top up wallet (User initiated - Legacy/Manual)
// @route   POST /api/wallet/topup
// @access  Private
const topUpWallet = asyncHandler(async (req, res) => {
    const { amount, paymentId, paymentGateway } = req.body;

    if (!amount || amount <= 0) {
        res.status(400);
        throw new Error('Invalid amount');
    }

    const user = await User.findById(req.user._id);

    // In a real app, verify paymentId with the gateway (Stripe/Razorpay) here
    // For now, we trust the successful payment from frontend

    user.walletBalance = (user.walletBalance || 0) + Number(amount);
    await user.save();

    await WalletTransaction.create({
        user: req.user._id,
        amount,
        type: 'CREDIT',
        description: `Wallet Top-up via ${paymentGateway || 'Online'}`,
        referenceId: paymentId,
        status: 'COMPLETED'
    });

    res.json({
        message: 'Wallet topped up successfully',
        balance: user.walletBalance,
        transactionId: paymentId
    });
});

// @desc    Initiate Wallet Topup (Razorpay)
// @route   POST /api/wallet/initiate-topup
// @access  Private
const initiateWalletTopup = asyncHandler(async (req, res) => {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
        res.status(400);
        throw new Error('Invalid amount');
    }

    try {
        const { instance, keyId, keySecret } = await getRazorpayInstance();

        console.log('Initiating Razorpay Topup with KeyID:', keyId ? keyId.substring(0, 10) + '...' : 'MISSING');
        console.log('KeySecret present:', !!keySecret);

        const options = {
            amount: Math.round(amount * 100), // amount in lowest denomination (paise)
            currency: 'INR',
            receipt: `w_${req.user._id.toString().slice(-6)}_${Date.now()}`, // Shortened to meet 40 char limit
            notes: {
                type: 'wallet_topup',
                userId: req.user._id.toString()
            }
        };

        console.log('Razorpay Order Options:', JSON.stringify(options));

        const order = await instance.orders.create(options);

        console.log('Razorpay Order Created:', order.id);

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: keyId
        });

    } catch (error) {
        console.error('Wallet Topup Init Error (Full):', JSON.stringify(error, null, 2));

        // Try to extract a meaningful message
        const msg = error.error?.description || error.description || error.message || 'Failed to initiate wallet topup';

        res.status(500).json({
            message: msg,
            error: msg
        });
    }
});

// @desc    Verify Wallet Topup (Razorpay)
// @route   POST /api/wallet/verify-topup
// @access  Private
const verifyWalletTopup = asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        res.status(400);
        throw new Error('Missing payment verification details');
    }

    // Check if already processed
    const existingTx = await WalletTransaction.findOne({ referenceId: razorpay_payment_id });
    if (existingTx) {
        return res.json({
            success: true,
            verified: true,
            message: 'Already processed',
            balance: (await User.findById(req.user._id)).walletBalance
        });
    }

    try {
        const { keySecret } = await getRazorpayInstance();

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto.createHmac('sha256', keySecret).update(body.toString()).digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            // Credit Wallet
            // We need to fetch the order amount ideally, or trust the frontend passed amount if we stored it temporarily.
            // Better approach: fetch order from Razorpay to be double sure, or rely on the fact that signature matches the order created with that amount.
            // However, we don't have the amount here in the request body usually for verification.
            // But since we created the order with a specific amount, and order_id is signed, it's safe.
            // We need the amount to credit. 
            // Let's fetch the order details from Razorpay to get the exact amount paid.

            const { instance } = await getRazorpayInstance();
            const order = await instance.orders.fetch(razorpay_order_id);

            if (!order) {
                throw new Error('Order not found on Razorpay');
            }

            const amountInRupees = order.amount / 100;

            const user = await User.findById(req.user._id);
            user.walletBalance = (user.walletBalance || 0) + Number(amountInRupees);
            await user.save();

            await WalletTransaction.create({
                user: req.user._id,
                amount: Number(amountInRupees),
                type: 'CREDIT',
                description: 'Wallet Top-up via Razorpay',
                referenceId: razorpay_payment_id,
                status: 'COMPLETED'
            });

            return res.json({
                success: true,
                verified: true,
                balance: user.walletBalance
            });
        } else {
            res.status(400).json({
                success: false,
                verified: false,
                message: 'Invalid signature'
            });
        }

    } catch (error) {
        console.error('Wallet Verify Error:', error);
        res.status(500).json({
            message: error.message || 'Failed to verify payment',
            error: error.message
        });
    }
});

module.exports = {
    getWallet,
    creditWallet,
    topUpWallet,
    initiateWalletTopup,
    verifyWalletTopup
};
