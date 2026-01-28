const asyncHandler = require('express-async-handler');
const Seller = require('../models/Seller');
const User = require('../models/User');
const Product = require('../models/Product');
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

// @desc    Get all sellers with filters
// @route   GET /api/admin/sellers
// @access  Private/Admin
const getAllSellers = asyncHandler(async (req, res) => {
    const {
        status,
        kycStatus,
        search,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = req.query;

    const filter = { isDeleted: false };

    if (status) {
        filter.status = status;
    }

    if (kycStatus) {
        filter['kyc.status'] = kycStatus;
    }

    if (search) {
        filter.$or = [
            { businessName: { $regex: search, $options: 'i' } },
            { ownerName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } }
        ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [sellers, totalCount] = await Promise.all([
        Seller.find(filter)
            .populate('user', 'name email profilePhoto')
            .populate('approvedBy', 'name')
            .populate('adminReview.reviewedBy', 'name')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit)),
        Seller.countDocuments(filter)
    ]);

    res.json({
        sellers,
        page: parseInt(page),
        pages: Math.ceil(totalCount / parseInt(limit)),
        total: totalCount
    });
});

// @desc    Get single seller details
// @route   GET /api/admin/sellers/:id
// @access  Private/Admin
const getSellerById = asyncHandler(async (req, res) => {
    const seller = await Seller.findById(req.params.id)
        .populate('user', 'name email phoneNumber profilePhoto createdAt')
        .populate('approvedBy', 'name email')
        .populate('adminReview.reviewedBy', 'name')
        .populate('approvalHistory.changedBy', 'name')
        .populate('kyc.verifiedBy', 'name');

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    // Get seller's product stats
    const productStats = await Product.aggregate([
        { $match: { seller: seller._id, isDeleted: false } },
        {
            $group: {
                _id: '$listingStatus',
                count: { $sum: 1 }
            }
        }
    ]);

    res.json({
        ...seller.toObject(),
        productStats
    });
});

// @desc    Admin review seller (recommend, request changes, etc)
// @route   PUT /api/admin/sellers/:id/review
// @access  Private/Admin
const reviewSeller = asyncHandler(async (req, res) => {
    const { reviewStatus, notes } = req.body;

    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    if (!['RECOMMENDED', 'CHANGES_REQUESTED', 'REJECTED'].includes(reviewStatus)) {
        res.status(400);
        throw new Error('Invalid review status');
    }

    seller.adminReview = {
        status: reviewStatus,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        notes
    };

    if (reviewStatus === 'RECOMMENDED') {
        seller.status = 'UNDER_REVIEW';
    } else if (reviewStatus === 'CHANGES_REQUESTED') {
        seller.status = 'PENDING_VERIFICATION';
    }

    // Set metadata for pre-save hook
    seller._updatedBy = req.user._id;
    seller._statusChangeReason = reviewStatus;
    seller._statusChangeNotes = notes;

    const updatedSeller = await seller.save();

    // Log audit
    await logAudit('SELLER_REVIEWED', req.user, 'SELLER', seller._id, {
        reviewStatus,
        notes
    });

    // Send email notification to seller
    const user = await User.findById(seller.user);
    if (user && user.email) {
        const subject = reviewStatus === 'RECOMMENDED'
            ? 'Your Seller Application is Under Final Review'
            : reviewStatus === 'CHANGES_REQUESTED'
                ? 'Changes Required for Your Seller Application'
                : 'Update on Your Seller Application';

        await sendEmail({
            email: user.email,
            subject,
            html: `
                <h2>Seller Application Update</h2>
                <p>Hello ${seller.ownerName},</p>
                <p>Your seller application for <strong>${seller.businessName}</strong> has been reviewed.</p>
                <p><strong>Status:</strong> ${reviewStatus.replace('_', ' ')}</p>
                ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
                <p>Please log in to your seller dashboard for more details.</p>
            `
        });
    }

    res.json(updatedSeller);
});

// @desc    Super Admin approve seller
// @route   PUT /api/admin/sellers/:id/approve
// @access  Private/Super Admin Only
const approveSeller = asyncHandler(async (req, res) => {
    const { commissionPercentage, notes } = req.body;

    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    // Update seller status
    seller.status = 'APPROVED';
    seller.approvedBy = req.user._id;
    seller.approvedAt = new Date();
    seller.isLive = true;
    seller.canAddProducts = true;
    seller.canReceiveOrders = true;
    seller.payoutStatus = 'ACTIVE';

    if (commissionPercentage !== undefined) {
        seller.commissionPercentage = commissionPercentage;
    }

    if (notes) {
        seller.adminNotes = notes;
    }

    // Update KYC status if not already verified
    if (!seller.kyc) {
        seller.kyc = {};
    }
    if (seller.kyc.status !== 'VERIFIED') {
        seller.kyc.status = 'VERIFIED';
        seller.kyc.verifiedBy = req.user._id;
        seller.kyc.verifiedAt = new Date();
    }

    // Set metadata for pre-save hook
    seller._updatedBy = req.user._id;
    seller._statusChangeReason = 'APPROVED';
    seller._statusChangeNotes = notes;

    const updatedSeller = await seller.save();

    // Log audit
    await logAudit('SELLER_APPROVED', req.user, 'SELLER', seller._id, {
        commissionPercentage: seller.commissionPercentage,
        notes
    });

    // Send approval email
    const user = await User.findById(seller.user);
    if (user && user.email) {
        await sendEmail({
            email: user.email,
            subject: '🎉 Congratulations! Your Seller Account is Approved',
            html: `
                <h2>Your Seller Account is Now Active!</h2>
                <p>Dear ${seller.ownerName},</p>
                <p>We're thrilled to inform you that your seller application for <strong>${seller.businessName}</strong> has been approved!</p>
                <p><strong>You can now:</strong></p>
                <ul>
                    <li>Add and manage your products</li>
                    <li>Receive customer orders</li>
                    <li>Track your earnings and payouts</li>
                </ul>
                <p><strong>Platform Commission:</strong> ${seller.commissionPercentage}%</p>
                <p>Log in to your seller dashboard to get started.</p>
                <p>Welcome to our marketplace!</p>
            `
        });
    }

    res.json(updatedSeller);
});

// @desc    Reject seller application
// @route   PUT /api/admin/sellers/:id/reject
// @access  Private/Admin or Super Admin
const rejectSeller = asyncHandler(async (req, res) => {
    const { reason, notes } = req.body;

    if (!reason) {
        res.status(400);
        throw new Error('Rejection reason is required');
    }

    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    seller.status = 'REJECTED';
    seller.rejectionReason = reason;
    seller.isLive = false;
    seller.canAddProducts = false;
    seller.canReceiveOrders = false;

    if (notes) {
        seller.adminNotes = notes;
    }

    // Set metadata for pre-save hook
    seller._updatedBy = req.user._id;
    seller._statusChangeReason = reason;
    seller._statusChangeNotes = notes;

    const updatedSeller = await seller.save();

    // Log audit
    await logAudit('SELLER_REJECTED', req.user, 'SELLER', seller._id, { reason, notes });

    // Send rejection email
    const user = await User.findById(seller.user);
    if (user && user.email) {
        await sendEmail({
            email: user.email,
            subject: 'Update on Your Seller Application',
            html: `
                <h2>Seller Application Update</h2>
                <p>Dear ${seller.ownerName},</p>
                <p>We regret to inform you that your seller application for <strong>${seller.businessName}</strong> could not be approved at this time.</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p>If you believe this was in error or would like to reapply with updated information, please contact our support team.</p>
            `
        });
    }

    res.json(updatedSeller);
});

// @desc    Suspend seller account
// @route   PUT /api/admin/sellers/:id/suspend
// @access  Private/Super Admin Only
const suspendSeller = asyncHandler(async (req, res) => {
    // Check both body and query for parameters to handle potential parsing issues
    const reason = req.body.reason || req.query.reason;
    const freezePayouts = req.body.freezePayouts || req.query.freezePayouts === 'true';

    if (!reason) {
        res.status(400);
        throw new Error('Suspension reason is required');
    }

    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    seller.status = 'SUSPENDED';
    seller.suspensionReason = reason;
    seller.isLive = false;
    seller.canAddProducts = false;
    seller.canReceiveOrders = false;

    if (freezePayouts) {
        seller.payoutStatus = 'FROZEN';
        seller.payoutNotes = `Frozen due to suspension: ${reason}`;
    }

    // Delist all seller products
    await Product.updateMany(
        { seller: seller._id },
        { isLive: false, listingStatus: 'DELISTED' }
    );

    // Set metadata for pre-save hook
    seller._updatedBy = req.user._id;
    seller._statusChangeReason = reason;

    const updatedSeller = await seller.save();

    // Log audit
    await logAudit('SELLER_SUSPENDED', req.user, 'SELLER', seller._id, {
        reason,
        freezePayouts
    });

    // Send suspension email
    const user = await User.findById(seller.user);
    if (user && user.email) {
        await sendEmail({
            email: user.email,
            subject: 'Important: Your Seller Account Has Been Suspended',
            html: `
                <h2>Seller Account Suspension Notice</h2>
                <p>Dear ${seller.ownerName},</p>
                <p>Your seller account for <strong>${seller.businessName}</strong> has been suspended.</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p>Your products have been temporarily delisted and you cannot receive new orders.</p>
                <p>Please contact our seller support team for more information and to resolve this issue.</p>
            `
        });
    }

    res.json(updatedSeller);
});

// @desc    Reactivate suspended seller
// @route   PUT /api/admin/sellers/:id/activate
// @access  Private/Super Admin Only
const activateSeller = asyncHandler(async (req, res) => {
    const { notes } = req.body;

    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    if (seller.status !== 'SUSPENDED') {
        res.status(400);
        throw new Error('Only suspended sellers can be reactivated');
    }

    seller.status = 'APPROVED';
    seller.suspensionReason = null;
    seller.isLive = true;
    seller.canAddProducts = true;
    seller.canReceiveOrders = true;
    seller.payoutStatus = 'ACTIVE';

    if (notes) {
        seller.adminNotes = (seller.adminNotes || '') + `\n[${new Date().toISOString()}] Reactivated: ${notes}`;
    }

    // Re-list approved products
    await Product.updateMany(
        { seller: seller._id, listingStatus: 'DELISTED' },
        { isLive: true, listingStatus: 'APPROVED' }
    );

    // Set metadata for pre-save hook
    seller._updatedBy = req.user._id;
    seller._statusChangeReason = 'REACTIVATED';
    seller._statusChangeNotes = notes;

    const updatedSeller = await seller.save();

    // Log audit
    await logAudit('SELLER_REACTIVATED', req.user, 'SELLER', seller._id, { notes });

    // Send reactivation email
    const user = await User.findById(seller.user);
    if (user && user.email) {
        await sendEmail({
            email: user.email,
            subject: 'Your Seller Account Has Been Reactivated',
            html: `
                <h2>Good News! Your Account is Active Again</h2>
                <p>Dear ${seller.ownerName},</p>
                <p>Your seller account for <strong>${seller.businessName}</strong> has been reactivated.</p>
                <p>You can now resume your selling activities on our platform.</p>
                <p>Thank you for your patience!</p>
            `
        });
    }

    res.json(updatedSeller);
});

// @desc    Update seller commission
// @route   PUT /api/admin/sellers/:id/commission
// @access  Private/Super Admin Only
const updateCommission = asyncHandler(async (req, res) => {
    const { commissionPercentage, notes } = req.body;

    if (commissionPercentage === undefined || commissionPercentage < 0 || commissionPercentage > 100) {
        res.status(400);
        throw new Error('Valid commission percentage (0-100) is required');
    }

    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    const oldCommission = seller.commissionPercentage;
    seller.commissionPercentage = commissionPercentage;

    if (notes) {
        seller.adminNotes = (seller.adminNotes || '') + `\n[${new Date().toISOString()}] Commission changed from ${oldCommission}% to ${commissionPercentage}%: ${notes}`;
    }

    const updatedSeller = await seller.save();

    // Log audit
    await logAudit('SELLER_COMMISSION_UPDATED', req.user, 'SELLER', seller._id, {
        oldCommission,
        newCommission: commissionPercentage,
        notes
    });

    res.json(updatedSeller);
});

// @desc    Freeze/Unfreeze seller payouts
// @route   PUT /api/admin/sellers/:id/payout-status
// @access  Private/Super Admin Only
const updatePayoutStatus = asyncHandler(async (req, res) => {
    const { payoutStatus, notes } = req.body;

    if (!['ACTIVE', 'FROZEN', 'PENDING', 'BLOCKED'].includes(payoutStatus)) {
        res.status(400);
        throw new Error('Invalid payout status');
    }

    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    const oldStatus = seller.payoutStatus;
    seller.payoutStatus = payoutStatus;
    seller.payoutNotes = notes;

    const updatedSeller = await seller.save();

    // Log audit
    await logAudit('SELLER_PAYOUT_STATUS_UPDATED', req.user, 'SELLER', seller._id, {
        oldStatus,
        newStatus: payoutStatus,
        notes
    });

    res.json(updatedSeller);
});

// @desc    Get seller statistics for dashboard
// @route   GET /api/admin/sellers/stats
// @access  Private/Admin
const getSellerStats = asyncHandler(async (req, res) => {
    const stats = await Seller.aggregate([
        { $match: { isDeleted: false } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    const kycStats = await Seller.aggregate([
        { $match: { isDeleted: false } },
        {
            $group: {
                _id: '$kyc.status',
                count: { $sum: 1 }
            }
        }
    ]);

    const totalSellers = await Seller.countDocuments({ isDeleted: false });
    const pendingApprovals = await Seller.countDocuments({
        status: { $in: ['PENDING_VERIFICATION', 'UNDER_REVIEW'] },
        isDeleted: false
    });

    res.json({
        total: totalSellers,
        pendingApprovals,
        byStatus: stats.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {}),
        byKycStatus: kycStats.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {})
    });
});

// @desc    Block seller permanently
// @route   PUT /api/admin/sellers/:id/block
// @access  Private/Super Admin Only
const blockSeller = asyncHandler(async (req, res) => {
    const { reason } = req.body;

    if (!reason) {
        res.status(400);
        throw new Error('Block reason is required');
    }

    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        res.status(404);
        throw new Error('Seller not found');
    }

    seller.status = 'BLOCKED';
    seller.suspensionReason = reason;
    seller.isLive = false;
    seller.canAddProducts = false;
    seller.canReceiveOrders = false;
    seller.payoutStatus = 'BLOCKED';

    // Block all seller products
    await Product.updateMany(
        { seller: seller._id },
        { isLive: false, listingStatus: 'BLOCKED' }
    );

    // Set metadata for pre-save hook
    seller._updatedBy = req.user._id;
    seller._statusChangeReason = reason;

    const updatedSeller = await seller.save();

    // Log audit
    await logAudit('SELLER_BLOCKED', req.user, 'SELLER', seller._id, { reason });

    res.json(updatedSeller);
});

module.exports = {
    getAllSellers,
    getSellerById,
    reviewSeller,
    approveSeller,
    rejectSeller,
    suspendSeller,
    activateSeller,
    updateCommission,
    updatePayoutStatus,
    getSellerStats,
    blockSeller
};
