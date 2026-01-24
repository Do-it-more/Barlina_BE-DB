const asyncHandler = require('express-async-handler');
const Seller = require('../models/Seller');
const User = require('../models/User');

// @desc    Register new seller / Become a seller
// @route   POST /api/sellers/register
// @access  Private
const registerSeller = asyncHandler(async (req, res) => {
    const { businessName, sellerType, pan, gstin, mobile } = req.body;

    // Check if user is already a seller
    const sellerExists = await Seller.findOne({ user: req.user._id });

    if (sellerExists) {
        res.status(400);
        throw new Error('User is already registered as a seller');
    }

    // Create Seller Profile
    const seller = await Seller.create({
        user: req.user._id,
        businessName,
        sellerType,
        pan,
        gstin,
        bankDetails: {
            accountNumber: '',
            ifsc: '',
            holderName: ''
        } // Initial blank details
    });

    if (seller) {
        // Upgrade User Role if not already
        const user = await User.findById(req.user._id);
        if (user.role === 'user') {
            user.role = 'seller';
            await user.save();
        }

        res.status(201).json({
            _id: seller._id,
            businessName: seller.businessName,
            status: seller.status,
            onboardingStep: seller.onboardingStep
        });
    } else {
        res.status(400);
        throw new Error('Invalid seller data');
    }
});

// @desc    Get current seller profile
// @route   GET /api/sellers/profile
// @access  Private (Seller)
const getSellerProfile = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (seller) {
        res.json(seller);
    } else {
        res.status(404);
        throw new Error('Seller profile not found');
    }
});

// @desc    Update seller bank details
// @route   PUT /api/sellers/bank
// @access  Private (Seller)
const updateBankDetails = asyncHandler(async (req, res) => {
    const { accountNumber, ifsc, holderName, bankName } = req.body;
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    seller.bankDetails = {
        accountNumber,
        ifsc,
        holderName,
        bankName
    };

    // Auto advance step if currently on step 1 or 2
    if (seller.onboardingStep < 3) {
        seller.onboardingStep = 2;
    }

    const updatedSeller = await seller.save();
    res.json(updatedSeller);
});

// @desc    Update KYC Documents
// @route   PUT /api/sellers/kyc
// @access  Private (Seller)
const updateKYC = asyncHandler(async (req, res) => {
    const { panUrl, aadhaarUrl, businessProofUrl } = req.body;
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    seller.kyc = {
        ...seller.kyc,
        panUrl: panUrl || seller.kyc.panUrl,
        aadhaarUrl: aadhaarUrl || seller.kyc.aadhaarUrl,
        businessProofUrl: businessProofUrl || seller.kyc.businessProofUrl,
        status: 'SUBMITTED' // Change to submitted for review
    };
    seller.status = 'KYC_PENDING';
    seller.onboardingStep = 3;

    const updatedSeller = await seller.save();
    res.json(updatedSeller);
});

// @desc    Get dashboard stats (product independent)
// @route   GET /api/sellers/dashboard/stats
// @access  Private (Seller)
const getSellerDashboardStats = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    // In a real app, query Orders, Products, Payouts models by sellerId
    // For now, return mock/initial independant stats

    // Product Independence Logic: check if seller has products
    // const productCount = await Product.countDocuments({ seller: seller._id });
    const productCount = 0; // Temporary until Product model linked to Seller

    res.json({
        profileStatus: seller.status,
        kycStatus: seller.kyc.status,
        productsCount: productCount,
        ordersCount: 0,
        revenue: 0,
        notifications: [
            { id: 1, message: 'Welcome to Seller Hub! Complete your KYC to start selling.', type: 'info' }
        ]
    });
});

module.exports = {
    registerSeller,
    getSellerProfile,
    updateBankDetails,
    updateKYC,
    getSellerDashboardStats
};
