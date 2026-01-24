const asyncHandler = require('express-async-handler');
const sendEmail = require('../utils/sendEmail');
const Order = require('../models/Order');
const Product = require('../models/Product');
const ReturnRequest = require('../models/ReturnRequest');
const AuditLog = require('../models/AuditLog');
const Setting = require('../models/Setting');
const FinancialRecord = require('../models/FinancialRecord');

// Get frontend URL from environment or default to localhost
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// @desc    Calculate return eligibility for all items in an order
// @route   GET /api/orders/:id/return-eligibility
// @access  Private
const getReturnEligibility = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) {
        res.status(404);
        throw new Error('Order not found');
    }

    const eligibility = [];

    // Pre-fetch all products for this order
    const productIds = order.orderItems.map(item => item.product);
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = {};
    products.forEach(p => productMap[p._id.toString()] = p);

    const settings = await Setting.findOne();
    const globalReturnsActive = settings ? settings.areReturnsActive : true;

    for (const item of order.orderItems) {
        let isEligible = true;
        let reasons = [];

        // 0. Global Setting Check
        if (!globalReturnsActive) {
            isEligible = false;
            reasons.push("Returns are currently disabled for the store.");
        }

        const product = productMap[item.product.toString()];

        // 1. Must be delivered
        if (!order.isDelivered || !order.deliveredAt) {
            isEligible = false;
            reasons.push("Item is not yet delivered.");
        }

        // 2. Product must exist and be returnable
        const returnPolicy = product ? (product.returnPolicy || {}) : {};
        // Default to TRUE (returnable) for legacy products without policy defined
        const isReturnable = (returnPolicy.isReturnable !== undefined) ? returnPolicy.isReturnable : true;

        if (!product || !isReturnable) {
            isEligible = false;
            reasons.push("This item is marked as non-returnable.");
        }

        // 3. Check return window
        if (order.deliveredAt && product) {
            const days = (returnPolicy.returnWindowDays !== undefined) ? returnPolicy.returnWindowDays : 7;
            const windowMs = days * 24 * 60 * 60 * 1000;
            const now = Date.now();
            const deliveryTime = new Date(order.deliveredAt).getTime();

            if (now > deliveryTime + windowMs) {
                isEligible = false;
                const expiry = new Date(deliveryTime + windowMs).toLocaleDateString();
                reasons.push(`Return window expired on ${expiry}.`);
            }
        }

        // 4. Check for existing active return
        const currentStatus = item.returnStatus || 'NONE';
        if (currentStatus !== 'NONE' && currentStatus !== 'REJECTED') {
            isEligible = false;
            reasons.push(`Return already ${currentStatus.toLowerCase()}.`);
        }

        eligibility.push({
            itemId: item._id,
            productId: item.product,
            name: item.name,
            isEligible,
            reasons,
            policy: product ? product.returnPolicy : null
        });
    }

    res.json(eligibility);
});

// @desc    Submit a return request
// @route   POST /api/orders/:id/return
// @access  Private
const requestReturn = asyncHandler(async (req, res) => {
    const { itemId, reason, comments, images } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
        res.status(404);
        throw new Error('Order not found');
    }

    const item = order.orderItems.id(itemId);
    if (!item) {
        res.status(404);
        throw new Error('Item not found in order');
    }

    const product = await Product.findById(item.product);

    // Check Global Settings
    const settings = await Setting.findOne();
    if (settings && !settings.areReturnsActive) {
        res.status(403);
        throw new Error("Returns are currently disabled for the store.");
    }


    // --- Strict Eligibility Check (Copy of Logic) ---
    if (!order.isDelivered) {
        res.status(400);
        throw new Error("Order not delivered yet.");
    }
    const returnPolicy = product.returnPolicy || {};
    const isReturnable = (returnPolicy.isReturnable !== undefined) ? returnPolicy.isReturnable : true;

    if (!isReturnable) {
        res.status(400);
        throw new Error("Item is not returnable.");
    }
    const days = (returnPolicy.returnWindowDays !== undefined) ? returnPolicy.returnWindowDays : 7;
    const windowMs = days * 24 * 60 * 60 * 1000;
    if (Date.now() > new Date(order.deliveredAt).getTime() + windowMs) {
        res.status(400);
        throw new Error("Return window expired.");
    }
    const currentStatus = item.returnStatus || 'NONE';
    if (currentStatus !== 'NONE' && currentStatus !== 'REJECTED') {
        res.status(400);
        throw new Error("Active return request already exists.");
    }
    // ------------------------------------------------

    // Create Request
    const returnRequest = await ReturnRequest.create({
        order: order._id,
        user: req.user._id,
        orderItem: {
            product: item.product,
            name: item.name,
            image: item.image,
            price: item.price,
            qty: item.qty
        },
        reason,
        comments,
        images,
        status: 'REQUESTED',
        history: [{ status: 'REQUESTED', updatedBy: req.user._id }]
    });

    // Update Order Item
    item.returnStatus = 'REQUESTED';
    item.returnRequestId = returnRequest._id;
    await order.save();

    await AuditLog.create({
        orderId: order._id,
        action: 'RETURN_REQUESTED',
        performedBy: { id: req.user._id, name: req.user.name, role: 'user' },
        note: `Return requested for ${item.name}. Reason: ${reason}`
    });

    res.status(201).json(returnRequest);
});

const AdminApprovalRequest = require('../models/AdminApprovalRequest');

// ... existing imports ...

// @desc    Admin: Update Return Status
// @route   PUT /api/returns/:id/status
// @access  Private/Admin
const updateReturnStatus = asyncHandler(async (req, res) => {
    const { status, adminNote, refundAmount, restoreInventory } = req.body;
    const returnReq = await ReturnRequest.findById(req.params.id);

    if (!returnReq) {
        res.status(404);
        throw new Error('Return request not found');
    }

    // --- APPROVAL WORKFLOW FOR NON-SUPER ADMINS ---
    // If not super admin, INTERCEPT the action and create a request
    if (req.user.role !== 'super_admin' && (status === 'APPROVED' || status === 'REFUNDED' || status === 'REJECTED' || status === 'REPLACED' || status === 'COMPLETED')) {

        // Check for existing pending request
        const existingRequest = await AdminApprovalRequest.findOne({
            targetId: returnReq._id,
            status: 'PENDING',
            action: 'APPROVE_RETURN'
        });

        if (existingRequest) {
            res.status(400);
            throw new Error('An approval request is already pending for this return.');
        }

        await AdminApprovalRequest.create({
            admin: req.user._id,
            action: 'APPROVE_RETURN',
            targetModel: 'ReturnRequest',
            targetId: returnReq._id,
            requestData: {
                status,
                adminNote,
                refundAmount,
                restoreInventory
            },
            status: 'PENDING'
        });

        return res.status(202).json({
            message: 'Action submitted for Super Admin approval.',
            approvalRequired: true
        });
    }

    const order = await Order.findById(returnReq.order);
    const item = order.orderItems.find(i => i.product.toString() === returnReq.orderItem.product.toString());

    // Update Request
    returnReq.status = status;
    returnReq.adminNote = adminNote;
    if (refundAmount) returnReq.refundAmount = refundAmount;

    returnReq.history.push({
        status,
        updatedBy: req.user._id
    });

    await returnReq.save();

    // Update Order Item Status
    if (item) {
        item.returnStatus = status;
        await order.save();
    }

    // Handle Inventory Restoration
    if (restoreInventory && (status === 'REFUNDED' || status === 'REPLACED' || status === 'APPROVED') && item) {
        const product = await Product.findById(item.product);
        if (product) {
            product.countInStock = (product.countInStock || 0) + item.qty;
            await product.save();
            await AuditLog.create({
                orderId: order._id,
                action: 'INVENTORY_RESTORED',
                performedBy: { id: req.user._id, name: req.user.name, role: 'admin' },
                note: `Restored ${item.qty} qty of ${item.name} from Return ${returnReq._id}`
            });
        }
    }

    // Log the return status change
    await AuditLog.create({
        orderId: order._id,
        action: `RETURN_${status}`,
        performedBy: { id: req.user._id, name: req.user.name, role: 'admin' },
        note: `Return status updated to ${status}`
    });

    // --- CREATE FINANCIAL RECORD FOR REFUND ---
    if (status === 'REFUNDED') {
        await FinancialRecord.create({
            type: 'REFUND',
            category: 'Product Return',
            amount: returnReq.refundAmount || 0, // Ensure refundAmount is set
            description: `Refund for Item: ${returnReq.orderItem.name} (Order: ${order.invoiceNumber || order._id})`,
            date: Date.now(),
            reference: {
                model: 'ReturnRequest',
                id: returnReq._id
            },
            paymentMethod: 'Other', // Or derive from order
            status: 'COMPLETED',
            createdBy: req.user._id
        });
    }

    // --- SEND EMAIL NOTIFICATIONS ---
    if (status === 'APPROVED') {
        try {
            // Populate user if needed, but returnReq usually has user ID. We need email.
            const returnWithUser = await ReturnRequest.findById(returnReq._id).populate('user', 'name email');
            const user = returnWithUser.user;

            await sendEmail({
                to: user.email,
                subject: `Return Approved: Request #${returnReq._id}`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #10B981;">Return Request Approved</h2>
                        <p>Hi ${user.name},</p>
                        <p>Your return request for <strong>${returnReq.orderItem.name}</strong> has been approved.</p>
                        
                        <div style="background-color: #ECFDF5; padding: 15px; margin: 20px 0; border-radius: 8px;">
                            <p style="margin: 0; font-weight: bold; color: #065F46;">Next Steps</p>
                            <p style="margin: 5px 0 0 0; color: #047857;">
                                We will schedule a pickup shortly. Please keep the item ready in its original packaging.
                            </p>
                        </div>

                        ${adminNote ? `<p><strong>Admin Note:</strong> ${adminNote}</p>` : ''}
                        
                        <p style="margin-top: 20px;">
                            <a href="${FRONTEND_URL}/profile" style="background-color: #10B981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Return Status</a>
                        </p>
                    </div>
                `
            });
            console.log(`Return Approved email sent to ${user.email}`);

        } catch (error) {
            console.error("Failed to send Return Approved email:", error);
        }
    }

    res.json(returnReq);
});

// @desc    Get all return requests (Admin)
// @route   GET /api/returns
// @access  Private/Admin
const getReturnRequests = asyncHandler(async (req, res) => {
    const requests = await ReturnRequest.find({})
        .populate('user', 'name email')
        .sort({ createdAt: -1 });
    res.json(requests);
});

// @desc    Get my return requests
// @route   GET /api/returns/my
// @access  Private
const getMyReturnRequests = asyncHandler(async (req, res) => {
    const requests = await ReturnRequest.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(requests);
});


const schedulePickup = asyncHandler(async (req, res) => {
    const { pickupDate } = req.body;
    const returnReq = await ReturnRequest.findById(req.params.id);

    if (!returnReq) {
        res.status(404);
        throw new Error('Return request not found');
    }

    if (returnReq.user.toString() !== req.user._id.toString()) {
        res.status(401);
        throw new Error('Not authorized to access this return');
    }

    if (returnReq.status !== 'APPROVED') {
        res.status(400);
        throw new Error('Return request must be APPROVED before scheduling pickup');
    }

    returnReq.pickupDate = pickupDate;
    returnReq.status = 'PICKUP_SCHEDULED';
    returnReq.history.push({
        status: 'PICKUP_SCHEDULED',
        updatedBy: req.user._id,
        note: `Pickup scheduled for ${new Date(pickupDate).toLocaleDateString()}`
    });

    await returnReq.save();

    // Update Order Item
    const order = await Order.findById(returnReq.order);
    const item = order.orderItems.find(i => i.product.toString() === returnReq.orderItem.product.toString());
    if (item) {
        item.returnStatus = 'PICKUP_SCHEDULED';
        await order.save();
    }

    await AuditLog.create({
        orderId: order._id,
        action: 'RETURN_PICKUP_SCHEDULED',
        performedBy: { id: req.user._id, name: req.user.name, role: 'user' },
        note: `Pickup scheduled for ${new Date(pickupDate).toLocaleDateString()}`
    });

    res.json(returnReq);
});

module.exports = {
    getReturnEligibility,
    requestReturn,
    updateReturnStatus,
    getReturnRequests,
    getMyReturnRequests,
    schedulePickup
};
