const asyncHandler = require('express-async-handler');
const AdminApprovalRequest = require('../models/AdminApprovalRequest');
const Product = require('../models/Product');
const Order = require('../models/Order');
const ReturnRequest = require('../models/ReturnRequest');
const AuditLog = require('../models/AuditLog');
const Seller = require('../models/Seller');

// @desc    Get all pending approval requests
// @route   GET /api/admin/management/approvals/pending
// @access  Private/SuperAdmin
const getPendingApprovals = asyncHandler(async (req, res) => {
    let approvals = await AdminApprovalRequest.find({ status: 'PENDING' })
        .populate('admin', 'name email')
        .sort({ createdAt: -1 })
        .lean();

    // Hydrate ReturnRequests with original customer evidence
    approvals = await Promise.all(approvals.map(async (approval) => {
        if (approval.targetModel === 'ReturnRequest' && approval.targetId) {
            const returnReq = await ReturnRequest.findById(approval.targetId)
                .select('images reason comments orderItem user')
                .populate('user', 'name email')
                .lean();

            if (returnReq) {
                approval.returnDetails = returnReq;
            }
        }
        return approval;
    }));

    // Fetch Pending Sellers
    const pendingSellers = await Seller.find({ status: { $in: ['PENDING_VERIFICATION', 'UNDER_REVIEW'] } })
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .lean();

    const sellerApprovals = pendingSellers.map(seller => ({
        _id: seller._id,
        targetModel: 'Seller Application',
        action: 'VERIFY_SELLER',
        status: 'PENDING',
        admin: seller.user, // The user asking for approval
        createdAt: seller.createdAt,
        isSellerRequest: true,
        requestData: {
            businessName: seller.businessName,
            sellerType: seller.sellerType,
            email: seller.email,
            phone: seller.phone
        }
    }));

    // Combine and Sort
    const combinedApprovals = [...approvals, ...sellerApprovals].sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json(combinedApprovals);
});

// @desc    Approve a request
// @route   PUT /api/admin/management/approvals/:id/approve
// @access  Private/SuperAdmin
const approveRequest = asyncHandler(async (req, res) => {
    const approval = await AdminApprovalRequest.findById(req.params.id);

    // Check for Seller Approval if not an AdminApprovalRequest
    if (!approval) {
        const seller = await Seller.findById(req.params.id);
        if (seller && ['PENDING_VERIFICATION', 'UNDER_REVIEW'].includes(seller.status)) {
            seller.status = 'APPROVED';
            seller.approvedBy = req.user._id;
            seller.approvalHistory.push({
                status: 'APPROVED',
                updatedBy: req.user._id,
                date: new Date(),
                reason: 'Approved via Approval Center'
            });
            await seller.save();
            return res.json({ message: 'Seller approved successfully', seller });
        }

        res.status(404);
        throw new Error('Approval request not found');
    }

    if (approval) {
        if (approval.status !== 'PENDING') {
            res.status(400);
            throw new Error(`Request is already ${approval.status}`);
        }

        // EXECUTE ACTION BASED ON TYPE
        switch (approval.action) {
            case 'DELETE_PRODUCT':
                const product = await Product.findById(approval.targetId);
                if (product) {
                    await product.deleteOne();
                } else {
                    // If product already gone, we can still mark authorized, or error. 
                    // Let's proceed to mark as approved since the goal (removal) is met.
                }
                break;

            case 'APPROVE_RETURN':
                const returnReq = await ReturnRequest.findById(approval.targetId);
                if (returnReq) {
                    const { status, adminNote, refundAmount, restoreInventory } = approval.requestData || {};
                    const order = await Order.findById(returnReq.order);
                    const item = order ? order.orderItems.find(i => i.product.toString() === returnReq.orderItem.product.toString()) : null;

                    returnReq.status = status;
                    returnReq.adminNote = adminNote;
                    if (refundAmount) returnReq.refundAmount = refundAmount;

                    returnReq.history.push({
                        status,
                        updatedBy: req.user._id,
                        note: 'Approved by Super Admin via Request System'
                    });

                    await returnReq.save();

                    // Update Order Item Status
                    if (item && order) {
                        item.returnStatus = status;
                        await order.save();
                    }

                    // Handle Inventory Restoration
                    if (restoreInventory && (status === 'REFUNDED' || status === 'REPLACED' || status === 'APPROVED') && item) {
                        const productItem = await Product.findById(item.product);
                        if (productItem) {
                            productItem.countInStock = (productItem.countInStock || 0) + item.qty;
                            await productItem.save();
                            await AuditLog.create({
                                orderId: order._id,
                                action: 'INVENTORY_RESTORED',
                                performedBy: { id: req.user._id, name: req.user.name, role: 'super_admin' },
                                note: `Restored ${item.qty} qty of ${item.name} (Approval Workflow)`
                            });
                        }
                    }

                    // Log the return status change
                    if (order) {
                        await AuditLog.create({
                            orderId: order._id,
                            action: `RETURN_${status}`,
                            performedBy: { id: req.user._id, name: req.user.name, role: 'super_admin' },
                            note: `Return status updated to ${status} by Super Admin`
                        });
                    }
                }
                break;

            // Future cases: 'REFUND_ORDER', 'BULK_DELETE', etc.

            default:
                // No automated action for this type
                break;
        }

        approval.status = 'APPROVED';
        approval.approvedBy = req.user._id;
        const updatedApproval = await approval.save();
        res.json(updatedApproval);
    }
});

// @desc    Reject a request
// @route   PUT /api/admin/management/approvals/:id/reject
// @access  Private/SuperAdmin
const rejectRequest = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const approval = await AdminApprovalRequest.findById(req.params.id);

    if (approval) {
        approval.status = 'REJECTED';
        approval.approvedBy = req.user._id;
        approval.rejectionReason = reason;
        const updatedApproval = await approval.save();
        res.json(updatedApproval);
    } else {
        // Check for Seller
        const seller = await Seller.findById(req.params.id);
        if (seller && ['PENDING_VERIFICATION', 'UNDER_REVIEW'].includes(seller.status)) {
            seller.status = 'REJECTED';
            seller.approvedBy = req.user._id;
            seller.rejectionReason = reason;
            seller.approvalHistory.push({
                status: 'REJECTED',
                updatedBy: req.user._id,
                date: new Date(),
                reason: reason || 'Rejected via Approval Center'
            });
            await seller.save();
            return res.json({ message: 'Seller rejected successfully', seller });
        }

        res.status(404);
        throw new Error('Approval request not found');
    }
});

module.exports = {
    getPendingApprovals,
    approveRequest,
    rejectRequest
};
