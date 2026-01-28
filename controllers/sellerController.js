const asyncHandler = require('express-async-handler');
const Seller = require('../models/Seller');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

// @desc    Register new seller / Become a seller
// @route   POST /api/sellers/register
// @access  Private
const registerSeller = asyncHandler(async (req, res) => {
    const {
        businessName,
        ownerName,
        email,
        phone,
        sellerType,
        pan,
        gstin,
        businessAddress
    } = req.body;

    // Check if user is already a seller
    const sellerExists = await Seller.findOne({ user: req.user._id });

    if (sellerExists) {
        res.status(400);
        throw new Error('User is already registered as a seller');
    }

    // Create Seller Profile - pan defaults to 'PENDING' if not provided (collected in step 2)
    const seller = await Seller.create({
        user: req.user._id,
        businessName,
        ownerName: ownerName || req.user.name,
        email: email || req.user.email,
        phone: phone || req.user.phoneNumber,
        sellerType: sellerType || 'INDIVIDUAL',
        pan: pan || 'PENDING',  // Placeholder, will be updated in step 2
        gstin,
        businessAddress: businessAddress || {},
        status: 'DRAFT',
        onboardingStep: 1
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
            onboardingStep: seller.onboardingStep,
            seller: seller  // Return full seller object for frontend
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
    const seller = await Seller.findOne({ user: req.user._id })
        .populate('approvedBy', 'name')
        .populate('adminReview.reviewedBy', 'name');

    if (seller) {
        res.json(seller);
    } else {
        res.status(404);
        throw new Error('Seller profile not found');
    }
});

// @desc    Update seller profile (Step 1 - Basic Info)
// @route   PUT /api/sellers/profile
// @access  Private (Seller)
const updateSellerProfile = asyncHandler(async (req, res) => {
    const {
        businessName,
        ownerName,
        email,
        phone,
        sellerType,
        pan,
        gstin,
        businessAddress
    } = req.body;

    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    // Only allow updates if not under review or approved
    if (['UNDER_REVIEW'].includes(seller.status)) {
        res.status(400);
        throw new Error('Cannot update profile while under review');
    }

    if (businessName) seller.businessName = businessName;
    if (ownerName) seller.ownerName = ownerName;
    if (email) seller.email = email;
    if (phone) seller.phone = phone;
    if (sellerType) seller.sellerType = sellerType;
    if (pan) seller.pan = pan;
    if (gstin !== undefined) seller.gstin = gstin;
    if (businessAddress) seller.businessAddress = { ...seller.businessAddress, ...businessAddress };

    // Auto advance step if currently on step 1
    if (seller.onboardingStep === 1) {
        seller.onboardingStep = 2;
    }

    const updatedSeller = await seller.save();
    res.json(updatedSeller);
});

// @desc    Update seller bank details (Step 2)
// @route   PUT /api/sellers/bank
// @access  Private (Seller)
const updateBankDetails = asyncHandler(async (req, res) => {
    const { accountNumber, ifsc, holderName, bankName, branchName } = req.body;
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    seller.bankDetails = {
        accountNumber,
        ifsc,
        holderName,
        bankName,
        branchName: branchName || ''
    };

    // Auto advance step
    if (seller.onboardingStep < 3) {
        seller.onboardingStep = 3;
    }

    const updatedSeller = await seller.save();
    res.json(updatedSeller);
});

// @desc    Update KYC Documents (Step 3)
// @route   PUT /api/sellers/kyc
// @access  Private (Seller)
const updateKYC = asyncHandler(async (req, res) => {
    const {
        panUrl,
        aadhaarUrl,
        addressProofUrl,
        businessProofUrl,
        chequeUrl,
        bankProofUrl,
        gstCertificateUrl,
        sellerPhotoUrl
    } = req.body;

    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    seller.kyc = {
        ...seller.kyc,
        panUrl: panUrl || seller.kyc.panUrl,
        aadhaarUrl: aadhaarUrl || seller.kyc.aadhaarUrl,
        addressProofUrl: addressProofUrl || seller.kyc.addressProofUrl,
        businessProofUrl: businessProofUrl || seller.kyc.businessProofUrl,
        chequeUrl: chequeUrl || seller.kyc.chequeUrl,
        bankProofUrl: bankProofUrl || seller.kyc.bankProofUrl,
        gstCertificateUrl: gstCertificateUrl || seller.kyc.gstCertificateUrl,
        sellerPhotoUrl: sellerPhotoUrl || seller.kyc.sellerPhotoUrl,
        status: 'SUBMITTED'
    };

    // Auto advance step
    if (seller.onboardingStep < 4) {
        seller.onboardingStep = 4;
    }

    const updatedSeller = await seller.save();
    res.json(updatedSeller);
});

// @desc    Submit seller application for review (Step 4)
// @route   POST /api/sellers/submit
// @access  Private (Seller)
const submitForReview = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    // Validate all required fields are filled
    const errors = [];

    if (!seller.businessName) errors.push('Business name is required');
    if (!seller.ownerName) errors.push('Owner name is required');
    if (!seller.email) errors.push('Email is required');
    if (!seller.phone) errors.push('Phone is required');
    if (!seller.pan) errors.push('PAN is required');
    if (!seller.bankDetails?.accountNumber) errors.push('Bank account number is required');
    if (!seller.bankDetails?.ifsc) errors.push('IFSC code is required');
    if (!seller.kyc?.panUrl) errors.push('PAN document is required');
    if (!seller.kyc?.aadhaarUrl) errors.push('Aadhaar document is required');

    if (errors.length > 0) {
        res.status(400);
        throw new Error(`Please complete the following: ${errors.join(', ')}`);
    }

    seller.status = 'PENDING_VERIFICATION';
    seller.kyc.status = 'SUBMITTED';
    seller.isOnboardingComplete = true;
    seller.onboardingStep = 5;

    // Add to approval history
    seller._updatedBy = req.user._id;
    seller._statusChangeReason = 'Submitted for review by seller';

    const updatedSeller = await seller.save();

    res.json({
        message: 'Application submitted successfully! Our team will review your application within 2-3 business days.',
        seller: updatedSeller
    });
});

// @desc    Get dashboard stats
// @route   GET /api/sellers/dashboard/stats
// @access  Private (Seller)
const getSellerDashboardStats = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    // Get actual product count
    const productCount = await Product.countDocuments({
        seller: seller._id,
        isDeleted: false
    });

    const liveProductCount = await Product.countDocuments({
        seller: seller._id,
        isDeleted: false,
        listingStatus: 'APPROVED',
        isLive: true
    });

    const pendingProductCount = await Product.countDocuments({
        seller: seller._id,
        isDeleted: false,
        listingStatus: 'UNDER_REVIEW'
    });

    // Get order stats (orders containing seller's products)
    // This would require orders to have seller reference or items with seller info
    // For now, returning seller's stored metrics

    res.json({
        profileStatus: seller.status,
        kycStatus: seller.kyc?.status || 'NOT_SUBMITTED',
        productsCount: productCount,
        liveProductsCount: liveProductCount,
        pendingProductsCount: pendingProductCount,
        ordersCount: seller.metrics?.totalOrders || 0,
        revenue: seller.metrics?.totalRevenue || 0,
        rating: seller.metrics?.rating || 0,
        commissionRate: seller.commissionPercentage,
        payoutStatus: seller.payoutStatus,
        canAddProducts: seller.canAddProducts,
        canReceiveOrders: seller.canReceiveOrders,
        notifications: getSellerNotifications(seller)
    });
});

// Helper function to generate notifications
function getSellerNotifications(seller) {
    const notifications = [];

    if (seller.status === 'DRAFT') {
        notifications.push({
            id: 1,
            message: 'Complete your seller profile to get started.',
            type: 'info',
            action: '/seller/onboarding'
        });
    }

    if (seller.status === 'PENDING_VERIFICATION') {
        notifications.push({
            id: 2,
            message: 'Your application is under review. We will notify you once reviewed.',
            type: 'info'
        });
    }

    if (seller.status === 'REJECTED') {
        notifications.push({
            id: 3,
            message: `Application rejected: ${seller.rejectionReason || 'Please contact support'}`,
            type: 'error',
            action: '/seller/profile'
        });
    }

    if (seller.status === 'SUSPENDED') {
        notifications.push({
            id: 4,
            message: `Account suspended: ${seller.suspensionReason || 'Please contact support'}`,
            type: 'error'
        });
    }

    if (seller.status === 'APPROVED' && !seller.metrics?.totalProducts) {
        notifications.push({
            id: 5,
            message: 'Start adding products to reach millions of customers!',
            type: 'success',
            action: '/seller/products/add'
        });
    }

    if (seller.payoutStatus === 'FROZEN') {
        notifications.push({
            id: 6,
            message: 'Your payouts are frozen. Please contact support.',
            type: 'warning'
        });
    }

    return notifications;
}

// @desc    Get seller's products
// @route   GET /api/sellers/products
// @access  Private (Seller)
const getSellerProducts = asyncHandler(async (req, res) => {
    const { status, search, page = 1, limit = 20 } = req.query;

    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    const filter = {
        seller: seller._id,
        isDeleted: false
    };

    if (status) {
        filter.listingStatus = status;
    }

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { brand: { $regex: search, $options: 'i' } }
        ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, totalCount] = await Promise.all([
        Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit)),
        Product.countDocuments(filter)
    ]);

    res.json({
        products,
        page: parseInt(page),
        pages: Math.ceil(totalCount / parseInt(limit)),
        total: totalCount
    });
});

// @desc    Create a new product (as DRAFT or submit for review)
// @route   POST /api/sellers/products
// @access  Private (Approved Seller)
const createSellerProduct = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    if (!seller.canAddProducts) {
        res.status(403);
        throw new Error('You are not authorized to add products');
    }

    const {
        name,
        description,
        price,
        discountPrice,
        category,
        brand,
        countInStock,
        image,
        images,
        colors,
        specifications,
        isCodAvailable,
        estimatedDeliveryDays,
        returnPolicy,
        submitForReview: shouldSubmit
    } = req.body;

    const product = await Product.create({
        user: req.user._id,
        seller: seller._id,
        ownerType: 'SELLER',
        name,
        description,
        price,
        discountPrice: discountPrice || 0,
        category,
        brand,
        countInStock: countInStock || 0,
        image,
        images: images || [],
        colors: colors || [],
        specifications: specifications || [],
        isCodAvailable: isCodAvailable !== false,
        estimatedDeliveryDays: estimatedDeliveryDays || 7,
        returnPolicy: returnPolicy || { isReturnable: true, returnWindowDays: 7, returnType: 'REFUND' },
        listingStatus: shouldSubmit ? 'UNDER_REVIEW' : 'DRAFT',
        isLive: false,
        reviewInfo: shouldSubmit ? { submittedAt: new Date() } : {}
    });

    // Update seller metrics
    await Seller.findByIdAndUpdate(seller._id, {
        $inc: { 'metrics.totalProducts': 1 }
    });

    res.status(201).json(product);
});

// @desc    Update a product
// @route   PUT /api/sellers/products/:id
// @access  Private (Seller - own products only)
const updateSellerProduct = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    // Verify ownership
    if (product.seller.toString() !== seller._id.toString()) {
        res.status(403);
        throw new Error('You do not have access to this product');
    }

    const updates = req.body;

    // Determine allowed updates based on status
    let allowedUpdates = [];

    // Always allow price and stock updates regardless of status
    const priceStockFields = ['price', 'discountPrice', 'countInStock'];

    // Fields that require re-approval (Content)
    const contentFields = [
        'name', 'description', 'category', 'brand',
        'image', 'images', 'colors', 'specifications',
        'isCodAvailable', 'estimatedDeliveryDays', 'returnPolicy'
    ];

    if (['DRAFT', 'REJECTED'].includes(product.listingStatus)) {
        // Can edit everything
        allowedUpdates = [...priceStockFields, ...contentFields];
    } else {
        // For APPROVED or UNDER_REVIEW, can only edit price/stock
        allowedUpdates = priceStockFields;

        // Check if user is trying to edit restricted fields
        const attemptedUpdates = Object.keys(updates);
        const hasRestrictedUpdates = attemptedUpdates.some(field =>
            contentFields.includes(field) && updates[field] !== undefined
        );

        if (hasRestrictedUpdates) {
            res.status(400);
            throw new Error('You can only update Price and Stock for live products. To update other details, please contact support or delete and recreate.');
        }
    }

    allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
            product[field] = updates[field];
        }
    });

    // If resubmitting for review
    if (updates.submitForReview) {
        product.listingStatus = 'UNDER_REVIEW';
        product.reviewInfo = {
            ...product.reviewInfo,
            submittedAt: new Date(),
            rejectionReason: null
        };
    }

    const updatedProduct = await product.save();
    res.json(updatedProduct);
});

// @desc    Submit product for review
// @route   POST /api/sellers/products/:id/submit
// @access  Private (Seller)
const submitProductForReview = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    if (product.seller.toString() !== seller._id.toString()) {
        res.status(403);
        throw new Error('You do not have access to this product');
    }

    if (!['DRAFT', 'REJECTED'].includes(product.listingStatus)) {
        res.status(400);
        throw new Error('Product is already submitted or live');
    }

    product.listingStatus = 'UNDER_REVIEW';
    product.reviewInfo = {
        ...product.reviewInfo,
        submittedAt: new Date(),
        rejectionReason: null
    };

    const updatedProduct = await product.save();
    res.json({
        message: 'Product submitted for review successfully!',
        product: updatedProduct
    });
});

// @desc    Delete (soft) a product
// @route   DELETE /api/sellers/products/:id
// @access  Private (Seller)
const deleteSellerProduct = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    if (product.seller.toString() !== seller._id.toString()) {
        res.status(403);
        throw new Error('You do not have access to this product');
    }

    // Soft delete
    product.isDeleted = true;
    product.deletedAt = new Date();
    product.deletedBy = req.user._id;
    product.isLive = false;

    await product.save();

    // Update seller metrics
    await Seller.findByIdAndUpdate(seller._id, {
        $inc: {
            'metrics.totalProducts': -1,
            'metrics.liveProducts': product.isLive ? -1 : 0
        }
    });

    res.json({ message: 'Product deleted successfully' });
});

// @desc    Get seller's orders
// @route   GET /api/sellers/orders
// @access  Private (Seller)
const getSellerOrders = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;

    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    // Get products owned by this seller
    const sellerProductIds = await Product.find({ seller: seller._id }).distinct('_id');

    // Find orders that contain seller's products
    const filter = {
        'orderItems.product': { $in: sellerProductIds }
    };

    if (status) {
        filter.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, totalCount] = await Promise.all([
        Order.find(filter)
            .populate('user', 'name email')
            .populate('orderItems.product', 'name image price seller')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit)),
        Order.countDocuments(filter)
    ]);

    // Filter order items to only show seller's products
    const filteredOrders = orders.map(order => {
        const orderObj = order.toObject();
        orderObj.orderItems = orderObj.orderItems.filter(item =>
            item.product && sellerProductIds.some(id => id.toString() === item.product._id.toString())
        );
        return orderObj;
    });

    res.json({
        orders: filteredOrders,
        page: parseInt(page),
        pages: Math.ceil(totalCount / parseInt(limit)),
        total: totalCount
    });
});

module.exports = {
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
};
