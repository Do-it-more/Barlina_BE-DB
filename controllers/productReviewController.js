const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const sendEmail = require('../utils/sendEmail');

// Helper function to log audit trail
const logAudit = async (action, performedUser, targetModel, targetId, metadata = {}) => {
    try {
        await AuditLog.create({
            action,
            performedBy: {
                id: performedUser._id,
                name: performedUser.name,
                role: performedUser.role
            },
            targetModel,
            targetId,
            metadata,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Audit log error:', error);
    }
};

// @desc    Get products pending review
// @route   GET /api/admin/product-reviews
// @access  Private/Admin
const getProductsForReview = asyncHandler(async (req, res) => {
    const {
        status = 'UNDER_REVIEW',
        category,
        sellerId,
        search,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = req.query;

    const filter = { isDeleted: false };

    // Status filter
    if (status === 'all') {
        filter.listingStatus = { $in: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'BLOCKED', 'DELISTED'] };
    } else {
        filter.listingStatus = status;
    }

    if (category) {
        filter.category = category;
    }

    if (sellerId) {
        filter.seller = sellerId;
    }

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { brand: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
        ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [products, totalCount] = await Promise.all([
        Product.find(filter)
            .populate('user', 'name email')
            .populate({
                path: 'seller',
                select: 'businessName ownerName email status',
                populate: { path: 'user', select: 'name email' }
            })
            .populate('reviewInfo.reviewedBy', 'name')
            .populate('reviewInfo.approvedBy', 'name')
            .sort(sort)
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

// @desc    Get single product review details
// @route   GET /api/admin/product-reviews/:id
// @access  Private/Admin
const getProductReviewById = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)
        .populate('user', 'name email')
        .populate({
            path: 'seller',
            select: 'businessName ownerName email status commissionPercentage',
            populate: { path: 'user', select: 'name email profilePhoto' }
        })
        .populate('reviewInfo.reviewedBy', 'name')
        .populate('reviewInfo.approvedBy', 'name')
        .populate('approvalHistory.changedBy', 'name');

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    res.json(product);
});

// @desc    Approve a product listing
// @route   PUT /api/admin/product-reviews/:id/approve
// @access  Private/Admin or Super Admin
const approveProduct = asyncHandler(async (req, res) => {
    const { notes, qualityScore } = req.body;

    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    if (product.listingStatus !== 'UNDER_REVIEW') {
        res.status(400);
        throw new Error('Only products under review can be approved');
    }

    // Check if seller is approved (for seller products)
    if (product.ownerType === 'SELLER') {
        const seller = await Seller.findById(product.seller);
        if (!seller || seller.status !== 'APPROVED') {
            res.status(400);
            throw new Error('Seller must be approved before their products can go live');
        }
    }

    product.listingStatus = 'APPROVED';
    product.isLive = true;
    product.reviewInfo = {
        ...product.reviewInfo,
        approvedBy: req.user._id,
        approvedAt: new Date(),
        adminNotes: notes
    };

    if (qualityScore !== undefined) {
        product.qualityScore = qualityScore;
    }

    // Set metadata for pre-save hook
    product._updatedBy = req.user._id;
    product._statusChangeReason = 'APPROVED';
    product._statusChangeNotes = notes;

    const updatedProduct = await product.save();

    // Update seller metrics
    if (product.seller) {
        await Seller.findByIdAndUpdate(product.seller, {
            $inc: { 'metrics.liveProducts': 1 }
        });
    }

    // Log audit
    await logAudit('PRODUCT_APPROVED', req.user, 'PRODUCT', product._id, {
        productName: product.name,
        notes
    });

    // Notify seller
    if (product.seller) {
        const seller = await Seller.findById(product.seller).populate('user', 'email');
        if (seller && seller.user && seller.user.email) {
            await sendEmail({
                email: seller.user.email,
                subject: '✅ Your Product Has Been Approved',
                html: `
                    <h2>Product Approved!</h2>
                    <p>Great news! Your product <strong>${product.name}</strong> has been approved and is now live on the marketplace.</p>
                    <p>Customers can now view and purchase your product.</p>
                    <p>Keep up the great work!</p>
                `
            });
        }
    }

    res.json(updatedProduct);
});

// @desc    Reject a product listing
// @route   PUT /api/admin/product-reviews/:id/reject
// @access  Private/Admin or Super Admin
const rejectProduct = asyncHandler(async (req, res) => {
    const { reason, notes } = req.body;

    if (!reason) {
        res.status(400);
        throw new Error('Rejection reason is required');
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    product.listingStatus = 'REJECTED';
    product.isLive = false;
    product.reviewInfo = {
        ...product.reviewInfo,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        rejectionReason: reason,
        adminNotes: notes
    };

    // Set metadata for pre-save hook
    product._updatedBy = req.user._id;
    product._statusChangeReason = reason;
    product._statusChangeNotes = notes;

    const updatedProduct = await product.save();

    // Log audit
    await logAudit('PRODUCT_REJECTED', req.user, 'PRODUCT', product._id, {
        productName: product.name,
        reason,
        notes
    });

    // Notify seller
    if (product.seller) {
        const seller = await Seller.findById(product.seller).populate('user', 'email');
        if (seller && seller.user && seller.user.email) {
            await sendEmail({
                email: seller.user.email,
                subject: 'Product Review Update',
                html: `
                    <h2>Product Review Result</h2>
                    <p>Your product <strong>${product.name}</strong> was not approved for listing.</p>
                    <p><strong>Reason:</strong> ${reason}</p>
                    ${notes ? `<p><strong>Additional Notes:</strong> ${notes}</p>` : ''}
                    <p>Please update your product according to the feedback and resubmit for review.</p>
                `
            });
        }
    }

    res.json(updatedProduct);
});

// @desc    Block a product
// @route   PUT /api/admin/product-reviews/:id/block
// @access  Private/Super Admin Only
const blockProduct = asyncHandler(async (req, res) => {
    const { reason } = req.body;

    if (!reason) {
        res.status(400);
        throw new Error('Block reason is required');
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    product.listingStatus = 'BLOCKED';
    product.isLive = false;
    product.flags = {
        isFlagged: true,
        flagReason: reason,
        flaggedAt: new Date(),
        flaggedBy: req.user._id
    };

    // Set metadata for pre-save hook
    product._updatedBy = req.user._id;
    product._statusChangeReason = reason;

    const updatedProduct = await product.save();

    // Update seller metrics
    if (product.seller) {
        await Seller.findByIdAndUpdate(product.seller, {
            $inc: { 'metrics.liveProducts': -1 }
        });
    }

    // Log audit
    await logAudit('PRODUCT_BLOCKED', req.user, 'PRODUCT', product._id, {
        productName: product.name,
        reason
    });

    // Notify seller
    if (product.seller) {
        const seller = await Seller.findById(product.seller).populate('user', 'email');
        if (seller && seller.user && seller.user.email) {
            await sendEmail({
                email: seller.user.email,
                subject: '⚠️ Important: Product Blocked',
                html: `
                    <h2>Product Blocked Notice</h2>
                    <p>Your product <strong>${product.name}</strong> has been blocked from the marketplace.</p>
                    <p><strong>Reason:</strong> ${reason}</p>
                    <p>If you believe this was in error, please contact seller support.</p>
                `
            });
        }
    }

    res.json(updatedProduct);
});

// @desc    Unblock a product
// @route   PUT /api/admin/product-reviews/:id/unblock
// @access  Private/Super Admin Only
const unblockProduct = asyncHandler(async (req, res) => {
    const { notes } = req.body;

    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    if (product.listingStatus !== 'BLOCKED') {
        res.status(400);
        throw new Error('Only blocked products can be unblocked');
    }

    product.listingStatus = 'APPROVED';
    product.isLive = true;
    product.flags = {
        isFlagged: false,
        flagReason: null,
        flaggedAt: null,
        flaggedBy: null
    };

    // Set metadata for pre-save hook
    product._updatedBy = req.user._id;
    product._statusChangeReason = 'UNBLOCKED';
    product._statusChangeNotes = notes;

    const updatedProduct = await product.save();

    // Update seller metrics
    if (product.seller) {
        await Seller.findByIdAndUpdate(product.seller, {
            $inc: { 'metrics.liveProducts': 1 }
        });
    }

    // Log audit
    await logAudit('PRODUCT_UNBLOCKED', req.user, 'PRODUCT', product._id, {
        productName: product.name,
        notes
    });

    res.json(updatedProduct);
});

// @desc    Request changes on a product
// @route   PUT /api/admin/product-reviews/:id/request-changes
// @access  Private/Admin
const requestProductChanges = asyncHandler(async (req, res) => {
    const { changes, notes } = req.body;

    if (!changes) {
        res.status(400);
        throw new Error('Requested changes description is required');
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    // Keep it as REJECTED so seller can edit and resubmit
    product.listingStatus = 'REJECTED';
    product.isLive = false;
    product.reviewInfo = {
        ...product.reviewInfo,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        rejectionReason: `Changes Requested: ${changes}`,
        adminNotes: notes
    };

    // Set metadata for pre-save hook
    product._updatedBy = req.user._id;
    product._statusChangeReason = 'CHANGES_REQUESTED';
    product._statusChangeNotes = changes;

    const updatedProduct = await product.save();

    // Log audit
    await logAudit('PRODUCT_CHANGES_REQUESTED', req.user, 'PRODUCT', product._id, {
        productName: product.name,
        changes,
        notes
    });

    // Notify seller
    if (product.seller) {
        const seller = await Seller.findById(product.seller).populate('user', 'email');
        if (seller && seller.user && seller.user.email) {
            await sendEmail({
                email: seller.user.email,
                subject: 'Changes Required for Your Product',
                html: `
                    <h2>Product Review - Changes Required</h2>
                    <p>Your product <strong>${product.name}</strong> requires some changes before it can be approved.</p>
                    <p><strong>Required Changes:</strong></p>
                    <p>${changes}</p>
                    ${notes ? `<p><strong>Additional Notes:</strong> ${notes}</p>` : ''}
                    <p>Please update your product and resubmit for review.</p>
                `
            });
        }
    }

    res.json(updatedProduct);
});

// @desc    Get product review statistics
// @route   GET /api/admin/product-reviews/stats
// @access  Private/Admin
const getProductReviewStats = asyncHandler(async (req, res) => {
    const stats = await Product.aggregate([
        { $match: { isDeleted: false, ownerType: 'SELLER' } },
        {
            $group: {
                _id: '$listingStatus',
                count: { $sum: 1 }
            }
        }
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaySubmissions = await Product.countDocuments({
        listingStatus: 'UNDER_REVIEW',
        'reviewInfo.submittedAt': { $gte: todayStart },
        isDeleted: false
    });

    const pendingReview = await Product.countDocuments({
        listingStatus: 'UNDER_REVIEW',
        isDeleted: false
    });

    res.json({
        pendingReview,
        todaySubmissions,
        byStatus: stats.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {})
    });
});

// @desc    Bulk approve products
// @route   POST /api/admin/product-reviews/bulk-approve
// @access  Private/Super Admin Only
const bulkApproveProducts = asyncHandler(async (req, res) => {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        res.status(400);
        throw new Error('Product IDs array is required');
    }

    const results = {
        approved: 0,
        failed: 0,
        errors: []
    };

    for (const productId of productIds) {
        try {
            const product = await Product.findById(productId);

            if (!product) {
                results.failed++;
                results.errors.push({ productId, error: 'Product not found' });
                continue;
            }

            if (product.listingStatus !== 'UNDER_REVIEW') {
                results.failed++;
                results.errors.push({ productId, error: 'Product not under review' });
                continue;
            }

            product.listingStatus = 'APPROVED';
            product.isLive = true;
            product.reviewInfo = {
                ...product.reviewInfo,
                approvedBy: req.user._id,
                approvedAt: new Date()
            };
            product._updatedBy = req.user._id;
            product._statusChangeReason = 'BULK_APPROVED';

            await product.save();
            results.approved++;

            // Log audit
            await logAudit('PRODUCT_BULK_APPROVED', req.user, 'PRODUCT', productId, {});
        } catch (error) {
            results.failed++;
            results.errors.push({ productId, error: error.message });
        }
    }

    res.json(results);
});

module.exports = {
    getProductsForReview,
    getProductReviewById,
    approveProduct,
    rejectProduct,
    blockProduct,
    unblockProduct,
    requestProductChanges,
    getProductReviewStats,
    bulkApproveProducts
};
