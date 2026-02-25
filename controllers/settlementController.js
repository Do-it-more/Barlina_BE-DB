const asyncHandler = require('express-async-handler');
const Settlement = require('../models/Settlement');
const SellerLedger = require('../models/SellerLedger');
const Seller = require('../models/Seller');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const sendEmail = require('../utils/sendEmail');
const { generateSettlementPDF } = require('../services/pdfService');
const {
    getSettlementGeneratedTemplate,
    getSettlementProcessedTemplate,
    getSettlementPaidTemplate
} = require('../services/emailTemplates');

/**
 * Settlement Controller
 * Handles seller payout management, financial reconciliation, and notifications
 */

// @desc    Get seller's financial dashboard
// @route   GET /api/settlements/dashboard
// @access  Private (Seller)
const getSellerFinancialDashboard = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller profile not found');
    }

    // Get balance summary
    const balance = await SellerLedger.getSellerBalance(seller._id);

    // Get recent transactions
    const recentTransactions = await SellerLedger.find({ seller: seller._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('order', 'invoiceNumber')
        .lean();

    // Get pending settlements
    const pendingSettlements = await Settlement.find({
        seller: seller._id,
        status: { $in: ['PENDING_APPROVAL', 'APPROVED', 'PROCESSING'] }
    }).sort({ createdAt: -1 });

    // Get past settlements
    const pastSettlements = await Settlement.find({
        seller: seller._id,
        status: 'PAID'
    }).sort({ createdAt: -1 }).limit(10);

    // Get summary stats
    const stats = await SellerLedger.aggregate([
        { $match: { seller: seller._id } },
        {
            $group: {
                _id: null,
                totalEarnings: {
                    $sum: {
                        $cond: [{ $eq: ['$type', 'ORDER_CREDIT'] }, '$grossAmount', 0]
                    }
                },
                totalCommission: {
                    $sum: {
                        $cond: [{ $eq: ['$type', 'ORDER_CREDIT'] }, '$commission', 0]
                    }
                },
                totalReturns: {
                    $sum: {
                        $cond: [{ $eq: ['$type', 'RETURN_DEBIT'] }, '$netAmount', 0]
                    }
                },
                totalPaidOut: {
                    $sum: {
                        $cond: [{ $eq: ['$type', 'PAYOUT'] }, '$netAmount', 0]
                    }
                }
            }
        }
    ]);

    res.json({
        balance,
        recentTransactions,
        pendingSettlements,
        pastSettlements,
        stats: stats[0] || { totalEarnings: 0, totalCommission: 0, totalReturns: 0, totalPaidOut: 0 },
        bankDetails: {
            // Masked for security
            accountNumber: seller.bankDetails?.accountNumber
                ? '****' + seller.bankDetails.accountNumber.slice(-4)
                : 'Not set',
            bankName: seller.bankDetails?.bankName || 'Not set',
            holderName: seller.bankDetails?.holderName || 'Not set'
        }
    });
});

// @desc    Get seller's ledger transactions
// @route   GET /api/settlements/ledger
// @access  Private (Seller)
const getSellerLedger = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller profile not found');
    }

    const { page = 1, limit = 20, type, status, startDate, endDate } = req.query;

    const filter = { seller: seller._id };

    if (type) filter.type = type;
    if (status) filter.status = status;
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const transactions = await SellerLedger.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('order', 'invoiceNumber')
        .lean();

    const total = await SellerLedger.countDocuments(filter);

    res.json({
        transactions,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

// @desc    Get seller's settlements history
// @route   GET /api/settlements/history
// @access  Private (Seller)
const getSellerSettlements = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller profile not found');
    }

    const { page = 1, limit = 10, status } = req.query;

    const filter = { seller: seller._id };
    if (status) filter.status = status;

    const settlements = await Settlement.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

    const total = await Settlement.countDocuments(filter);

    res.json({
        settlements,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

// ==================== ADMIN ENDPOINTS ====================

// @desc    Get all pending settlements (Admin)
// @route   GET /api/settlements/admin/pending
// @access  Private/Admin
const getPendingSettlements = asyncHandler(async (req, res) => {
    const settlements = await Settlement.find({
        status: { $in: ['PENDING_APPROVAL', 'APPROVED'] }
    })
        .populate('seller', 'businessName ownerName email bankDetails')
        .sort({ createdAt: -1 });

    res.json(settlements);
});

// @desc    Get all settlements (Admin)
// @route   GET /api/settlements/admin
// @access  Private/Admin
const getAllSettlements = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, sellerId, startDate, endDate } = req.query;

    const filter = {};
    if (status && status !== 'ALL') filter.status = status;
    if (sellerId) filter.seller = sellerId;
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const settlements = await Settlement.find(filter)
        .populate('seller', 'businessName ownerName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await Settlement.countDocuments(filter);

    // Aggregate totals
    const totals = await Settlement.aggregate([
        { $match: filter },
        {
            $group: {
                _id: null,
                totalGross: { $sum: '$grossAmount' },
                totalCommission: { $sum: '$totalCommission' },
                totalPayable: { $sum: '$netPayable' },
                count: { $sum: 1 }
            }
        }
    ]);

    res.json({
        settlements,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        },
        totals: totals[0] || { totalGross: 0, totalCommission: 0, totalPayable: 0, count: 0 }
    });
});

// @desc    Generate settlement for a seller (Admin)
// @route   POST /api/settlements/admin/generate
// @access  Private/SuperAdmin
const generateSettlement = asyncHandler(async (req, res) => {
    const { sellerId, periodStart, periodEnd } = req.body;

    if (!sellerId || !periodStart || !periodEnd) {
        res.status(400);
        throw new Error('Seller ID, period start, and period end are required');
    }

    try {
        const settlement = await Settlement.generateSettlement(
            sellerId,
            new Date(periodStart),
            new Date(periodEnd),
            req.user._id
        );

        // Populate seller for email
        await settlement.populate('seller');

        // Send notification email
        if (settlement.seller && settlement.seller.email) {
            try {
                await sendEmail({
                    to: settlement.seller.email,
                    subject: `Settlement Generated: ${settlement.settlementNumber}`,
                    html: getSettlementGeneratedTemplate(settlement)
                });
            } catch (emailError) {
                console.error('Failed to send settlement generation email:', emailError);
            }
        }

        // Create audit log
        await AuditLog.create({
            action: 'SETTLEMENT_GENERATED',
            performedBy: { id: req.user._id, name: req.user.name, role: req.user.role },
            note: `Generated settlement ${settlement.settlementNumber} for ₹${settlement.netPayable}`
        });

        res.status(201).json(settlement);
    } catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});

// @desc    Approve settlement (SuperAdmin)
// @route   PUT /api/settlements/admin/:id/approve
// @access  Private/SuperAdmin
const approveSettlement = asyncHandler(async (req, res) => {
    const settlement = await Settlement.findById(req.params.id).populate('seller');

    if (!settlement) {
        res.status(404);
        throw new Error('Settlement not found');
    }

    if (settlement.status !== 'PENDING_APPROVAL') {
        res.status(400);
        throw new Error('Settlement is not pending approval');
    }

    settlement.status = 'APPROVED';
    settlement.approvedBy = req.user._id;
    settlement.approvedAt = new Date();
    settlement.adminNotes = req.body.notes || settlement.adminNotes;

    await settlement.save();

    // Audit log
    await AuditLog.create({
        action: 'SETTLEMENT_APPROVED',
        performedBy: { id: req.user._id, name: req.user.name, role: req.user.role },
        note: `Approved settlement ${settlement.settlementNumber}`
    });

    res.json(settlement);
});

// @desc    Reject settlement (SuperAdmin)
// @route   PUT /api/settlements/admin/:id/reject
// @access  Private/SuperAdmin
const rejectSettlement = asyncHandler(async (req, res) => {
    const settlement = await Settlement.findById(req.params.id);

    if (!settlement) {
        res.status(404);
        throw new Error('Settlement not found');
    }

    if (settlement.status !== 'PENDING_APPROVAL') {
        res.status(400);
        throw new Error('Only pending settlements can be rejected');
    }

    settlement.status = 'REJECTED';
    settlement.adminNotes = req.body.reason || 'Rejected by admin';
    settlement.rejectedBy = req.user._id;
    settlement.rejectedAt = new Date();

    // Release ledger entries back to ELIGIBLE
    if (settlement.ledgerEntries && settlement.ledgerEntries.length > 0) {
        await SellerLedger.updateMany(
            { _id: { $in: settlement.ledgerEntries } },
            { $set: { status: 'ELIGIBLE', settlement: null } }
        );
    }

    await settlement.save();

    await AuditLog.create({
        action: 'SETTLEMENT_REJECTED',
        performedBy: { id: req.user._id, name: req.user.name, role: req.user.role },
        note: `Rejected settlement ${settlement.settlementNumber}. Reason: ${settlement.adminNotes}`
    });

    res.json(settlement);
});

// @desc    Process settlement payment (Finance)
// @route   PUT /api/settlements/admin/:id/process
// @access  Private/Finance
const processSettlement = asyncHandler(async (req, res) => {
    const { utrNumber, transactionId, notes } = req.body;
    const settlement = await Settlement.findById(req.params.id).populate('seller');

    if (!settlement) {
        res.status(404);
        throw new Error('Settlement not found');
    }

    if (settlement.status !== 'APPROVED') {
        res.status(400);
        throw new Error('Settlement must be approved before processing');
    }

    settlement.status = 'PROCESSING';
    settlement.paymentInfo = {
        ...settlement.paymentInfo,
        utrNumber,
        transactionId
    };
    settlement.processedBy = req.user._id;
    settlement.processedAt = new Date();
    settlement.adminNotes = notes || settlement.adminNotes;

    await settlement.save();

    // Send notification email
    if (settlement.seller && settlement.seller.email) {
        try {
            await sendEmail({
                to: settlement.seller.email,
                subject: `Settlement Processing: ${settlement.settlementNumber}`,
                html: getSettlementProcessedTemplate(settlement)
            });
        } catch (emailError) {
            console.error('Failed to send settlement processing email:', emailError);
        }
    }

    res.json(settlement);
});

// @desc    Mark settlement as paid (Finance)
// @route   PUT /api/settlements/admin/:id/paid
// @access  Private/Finance
const markSettlementPaid = asyncHandler(async (req, res) => {
    const { utrNumber, transactionId, notes } = req.body;
    const settlement = await Settlement.findById(req.params.id)
        .populate('seller')
        .populate('ledgerEntries');

    if (!settlement) {
        res.status(404);
        throw new Error('Settlement not found');
    }

    if (!['APPROVED', 'PROCESSING'].includes(settlement.status)) {
        res.status(400);
        throw new Error('Settlement must be approved or processing');
    }

    settlement.status = 'PAID';
    settlement.paymentInfo = {
        method: 'BANK_TRANSFER',
        utrNumber: utrNumber || settlement.paymentInfo?.utrNumber,
        transactionId: transactionId || settlement.paymentInfo?.transactionId,
        paidAt: new Date()
    };
    settlement.adminNotes = notes || settlement.adminNotes;

    await settlement.save();

    // Create PAYOUT ledger entry
    await SellerLedger.create({
        seller: settlement.seller._id || settlement.seller,
        type: 'PAYOUT',
        grossAmount: settlement.netPayable,
        netAmount: settlement.netPayable,
        runningBalance: 0, // Will be recalculated
        description: `Settlement payout: ${settlement.settlementNumber}`,
        settlement: settlement._id,
        status: 'SETTLED',
        createdBy: req.user._id
    });

    // Generate PDF and send email
    try {
        const pdfBuffer = await generateSettlementPDF(settlement, settlement.ledgerEntries);

        if (settlement.seller && settlement.seller.email) {
            await sendEmail({
                to: settlement.seller.email,
                subject: `Payment Received: Settlement ${settlement.settlementNumber}`,
                html: getSettlementPaidTemplate(settlement),
                attachments: [
                    {
                        filename: `Settlement_${settlement.settlementNumber}.pdf`,
                        content: pdfBuffer.toString('base64'),
                        contentType: 'application/pdf'
                    }
                ]
            });
        }
    } catch (error) {
        console.error('Failed to generate PDF or send email:', error);
        // Don't fail the request if email fails
    }

    // Audit log
    await AuditLog.create({
        action: 'SETTLEMENT_PAID',
        performedBy: { id: req.user._id, name: req.user.name, role: req.user.role },
        note: `Marked settlement ${settlement.settlementNumber} as paid. UTR: ${utrNumber}`
    });

    res.json(settlement);
});

// @desc    Get settlement details (Admin or Seller)
// @route   GET /api/settlements/:id
// @access  Private
const getSettlementById = asyncHandler(async (req, res) => {
    const settlement = await Settlement.findById(req.params.id)
        .populate('seller', 'businessName ownerName email bankDetails')
        .populate('ledgerEntries')
        .populate('approvedBy', 'name email')
        .populate('processedBy', 'name email');

    if (!settlement) {
        res.status(404);
        throw new Error('Settlement not found');
    }

    // Check authorization
    if (req.user.role === 'seller') {
        const seller = await Seller.findOne({ user: req.user._id });
        if (!seller || settlement.seller._id.toString() !== seller._id.toString()) {
            res.status(403);
            throw new Error('Not authorized to view this settlement');
        }
    }

    res.json(settlement);
});

// @desc    Release held funds (Cron job helper)
// @route   POST /api/settlements/admin/release-holds
// @access  Private/System
const releaseHeldFunds = asyncHandler(async (req, res) => {
    const now = new Date();

    // Find all ON_HOLD entries where holdUntil has passed
    const releasedEntries = await SellerLedger.updateMany(
        {
            status: 'ON_HOLD',
            holdUntil: { $lte: now }
        },
        {
            $set: { status: 'ELIGIBLE' }
        }
    );

    res.json({
        message: 'Held funds released',
        releasedCount: releasedEntries.modifiedCount
    });
});

// @desc    Get settlement stats for admin dashboard
// @route   GET /api/settlements/admin/stats
// @access  Private/Admin
const getSettlementStats = asyncHandler(async (req, res) => {
    const stats = await Settlement.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalAmount: { $sum: '$netPayable' }
            }
        }
    ]);

    const result = {
        pending: 0,
        approved: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        totalPaid: 0
    };

    stats.forEach(stat => {
        if (stat._id === 'PENDING_APPROVAL') result.pending += stat.count;
        if (stat._id === 'APPROVED') result.approved += stat.count;
        if (stat._id === 'PROCESSING') result.processing += stat.count;
        if (stat._id === 'PAID') {
            result.completed += stat.count;
            result.totalPaid += stat.totalAmount;
        }
        if (stat._id === 'REJECTED') result.failed += stat.count;
    });

    res.json(result);
});

// @desc    Download settlement PDF
// @route   GET /api/settlements/:id/pdf
// @access  Private
const downloadSettlementPDF = asyncHandler(async (req, res) => {
    const settlement = await Settlement.findById(req.params.id)
        .populate('seller')
        .populate('ledgerEntries');

    if (!settlement) {
        res.status(404);
        throw new Error('Settlement not found');
    }

    // Check authorization
    if (req.user.role === 'seller') {
        const seller = await Seller.findOne({ user: req.user._id });
        if (!seller || settlement.seller._id.toString() !== seller._id.toString()) {
            res.status(403);
            throw new Error('Not authorized to view this settlement');
        }
    }

    try {
        const pdfBuffer = await generateSettlementPDF(settlement, settlement.ledgerEntries);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=Settlement_${settlement.settlementNumber}.pdf`,
            'Content-Length': pdfBuffer.length
        });

        res.send(pdfBuffer);
    } catch (error) {
        console.error('PDF Generation Error:', error);
        res.status(500);
        throw new Error('Failed to generate PDF');
    }
});

// @desc    Get commission dashboard for Super Admin (all sellers overview)
// @route   GET /api/settlements/admin/commission-dashboard
// @access  Private/Admin
const getCommissionDashboard = asyncHandler(async (req, res) => {
    const { period = '30', sellerId } = req.query;

    const periodDays = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    // Get all approved sellers
    const sellers = await Seller.find(
        sellerId ? { _id: sellerId, status: 'APPROVED' } : { status: 'APPROVED' }
    ).select('businessName ownerName email commissionPercentage phone kyc.sellerPhotoUrl metrics').lean();

    const sellerIds = sellers.map(s => s._id);

    // Get all delivered/paid orders containing seller products in the period
    const Order = require('../models/Order');
    const Product = require('../models/Product');

    // Get all products by sellers
    const sellerProducts = await Product.find({ seller: { $in: sellerIds } }).select('_id seller price').lean();
    const productToSeller = {};
    sellerProducts.forEach(p => {
        productToSeller[p._id.toString()] = p.seller.toString();
    });

    // Get completed orders (PAID, DELIVERED, etc.) in the period
    const orders = await Order.find({
        'orderItems.product': { $in: sellerProducts.map(p => p._id) },
        status: { $in: ['PAID', 'READY_TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
        createdAt: { $gte: startDate }
    }).select('orderItems totalPrice status createdAt').lean();

    // Aggregate per-seller data
    const sellerFinancials = {};

    // Initialize all sellers
    sellers.forEach(seller => {
        sellerFinancials[seller._id.toString()] = {
            seller: {
                _id: seller._id,
                businessName: seller.businessName,
                ownerName: seller.ownerName,
                email: seller.email,
                phone: seller.phone,
                commissionRate: seller.commissionPercentage || 10,
                sellerPhotoUrl: seller.kyc?.sellerPhotoUrl
            },
            totalOrders: 0,
            totalItems: 0,
            grossRevenue: 0,
            platformCommission: 0,
            sellerProfit: 0,
            orderIds: new Set()
        };
    });

    // Process each order
    orders.forEach(order => {
        order.orderItems.forEach(item => {
            const productId = item.product?.toString();
            const sellerId = productToSeller[productId];

            if (sellerId && sellerFinancials[sellerId]) {
                const itemTotal = item.itemTotal || (item.price * item.qty);
                const commissionRate = item.commissionRate || sellerFinancials[sellerId].seller.commissionRate || 10;
                const commission = item.platformCommission || (itemTotal * commissionRate / 100);
                const sellerShare = item.sellerShare || (itemTotal - commission);

                sellerFinancials[sellerId].grossRevenue += itemTotal;
                sellerFinancials[sellerId].platformCommission += commission;
                sellerFinancials[sellerId].sellerProfit += sellerShare;
                sellerFinancials[sellerId].totalItems += item.qty;
                sellerFinancials[sellerId].orderIds.add(order._id.toString());
            }
        });
    });

    // Convert to array and calculate order counts
    const sellerBreakdown = Object.values(sellerFinancials).map(data => ({
        ...data,
        totalOrders: data.orderIds.size,
        orderIds: undefined // Don't send the set
    }));

    // Calculate platform totals
    const platformTotals = sellerBreakdown.reduce((acc, s) => {
        acc.totalOrders += s.totalOrders;
        acc.totalItems += s.totalItems;
        acc.grossRevenue += s.grossRevenue;
        acc.platformCommission += s.platformCommission;
        acc.sellerPayouts += s.sellerProfit;
        return acc;
    }, { totalOrders: 0, totalItems: 0, grossRevenue: 0, platformCommission: 0, sellerPayouts: 0 });

    // Get settlement stats
    const settlementTotals = await Settlement.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                amount: { $sum: '$netPayable' },
                commission: { $sum: '$totalCommission' }
            }
        }
    ]);

    const settlementSummary = {
        pending: 0, pendingAmount: 0,
        paid: 0, paidAmount: 0, paidCommission: 0,
        total: 0
    };

    settlementTotals.forEach(s => {
        settlementSummary.total += s.count;
        if (['PENDING_APPROVAL', 'APPROVED', 'PROCESSING'].includes(s._id)) {
            settlementSummary.pending += s.count;
            settlementSummary.pendingAmount += s.amount;
        }
        if (s._id === 'PAID') {
            settlementSummary.paid += s.count;
            settlementSummary.paidAmount += s.amount;
            settlementSummary.paidCommission += s.commission;
        }
    });

    res.json({
        period: periodDays,
        platformTotals,
        sellers: sellerBreakdown.sort((a, b) => b.grossRevenue - a.grossRevenue),
        settlementSummary,
        totalActiveSellers: sellers.length
    });
});

// @desc    Get seller earnings summary (for seller dashboard)
// @route   GET /api/settlements/earnings-summary
// @access  Private (Seller)
const getSellerEarningsSummary = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ user: req.user._id });

    if (!seller) {
        res.status(404);
        throw new Error('Seller profile not found');
    }

    const Order = require('../models/Order');
    const Product = require('../models/Product');

    // Get seller's product IDs
    const sellerProductIds = await Product.find({ seller: seller._id }).distinct('_id');

    // Get all orders containing seller products
    const orders = await Order.find({
        'orderItems.product': { $in: sellerProductIds },
        status: { $in: ['PAID', 'READY_TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] }
    }).select('orderItems totalPrice status createdAt').lean();

    let totalOrders = new Set();
    let totalItems = 0;
    let grossRevenue = 0;
    let totalCommissionPaid = 0;
    let netProfit = 0;

    // Monthly breakdown (last 6 months)
    const monthlyData = {};

    orders.forEach(order => {
        const monthKey = `${order.createdAt.getFullYear()}-${String(order.createdAt.getMonth() + 1).padStart(2, '0')}`;

        order.orderItems.forEach(item => {
            const productId = item.product?.toString();
            if (sellerProductIds.some(id => id.toString() === productId)) {
                const itemTotal = item.itemTotal || (item.price * item.qty);
                const commissionRate = item.commissionRate || seller.commissionPercentage || 10;
                const commission = item.platformCommission || (itemTotal * commissionRate / 100);
                const sellerShare = item.sellerShare || (itemTotal - commission);

                grossRevenue += itemTotal;
                totalCommissionPaid += commission;
                netProfit += sellerShare;
                totalItems += item.qty;
                totalOrders.add(order._id.toString());

                // Monthly aggregation
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { revenue: 0, commission: 0, profit: 0, orders: new Set() };
                }
                monthlyData[monthKey].revenue += itemTotal;
                monthlyData[monthKey].commission += commission;
                monthlyData[monthKey].profit += sellerShare;
                monthlyData[monthKey].orders.add(order._id.toString());
            }
        });
    });

    // Get balance info from ledger
    const balance = await SellerLedger.getSellerBalance(seller._id);

    // Get pending settlements
    const pendingSettlements = await Settlement.countDocuments({
        seller: seller._id,
        status: { $in: ['PENDING_APPROVAL', 'APPROVED', 'PROCESSING'] }
    });

    const paidSettlements = await Settlement.aggregate([
        { $match: { seller: seller._id, status: 'PAID' } },
        { $group: { _id: null, total: { $sum: '$netPayable' }, count: { $sum: 1 } } }
    ]);

    // Convert monthlyData to sorted array
    const monthlyBreakdown = Object.entries(monthlyData)
        .map(([month, data]) => ({
            month,
            revenue: data.revenue,
            commission: data.commission,
            profit: data.profit,
            orders: data.orders.size
        }))
        .sort((a, b) => b.month.localeCompare(a.month))
        .slice(0, 6);

    res.json({
        summary: {
            totalOrders: totalOrders.size,
            totalItems,
            grossRevenue,
            totalCommissionPaid,
            netProfit,
            commissionRate: seller.commissionPercentage || 10
        },
        balance,
        settlements: {
            pending: pendingSettlements,
            totalPaid: paidSettlements[0]?.total || 0,
            paidCount: paidSettlements[0]?.count || 0
        },
        monthlyBreakdown
    });
});

module.exports = {
    getSellerFinancialDashboard,
    getSellerLedger,
    getSellerSettlements,
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
};
