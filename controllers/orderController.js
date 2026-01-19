const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Stripe = require('stripe');
const sendEmail = require('../utils/sendEmail');
const AuditLog = require('../models/AuditLog');
const ReturnRequest = require('../models/ReturnRequest');
const Setting = require('../models/Setting');

// @desc    Update order to paid
// @route   PUT /api/orders/:id/pay
// @access  Private
const updateOrderToPaid = asyncHandler(async (req, res) => {
    // ... same as before ...
    const order = await Order.findById(req.params.id).populate('user', 'email name');

    if (order) {
        if (order.isPaid) {
            res.status(400);
            throw new Error('Order is already marked as paid');
        }
        order.isPaid = true;
        order.status = 'PAID';
        order.paidAt = Date.now();

        await AuditLog.create({
            orderId: order._id,
            statusFrom: 'CREATED',
            statusTo: 'PAID',
            action: 'PAYMENT_RECEIVED',
            performedBy: {
                id: req.user._id, // Might be system or user relying on context
                name: req.user.name || 'System',
                role: 'system'
            },
            note: 'Payment received successfully'
        });
        order.paymentResult = {
            id: req.body.id,
            status: req.body.status,
            update_time: req.body.update_time,
            email_address: req.body.payer?.email_address || req.user.email,
        };

        const updatedOrder = await order.save();

        // Stock updates code ...
        // ...

        const generateInvoicePDF = require('../utils/generateInvoice');

        // --- SEND RECEIPT EMAIL WITH PDF ---
        try {
            const invoiceBuffer = await generateInvoicePDF(updatedOrder, order.user);
            const invoiceBase64 = invoiceBuffer.toString('base64');

            await sendEmail({
                to: order.user.email,
                subject: `Order Confirmation & Invoice: #${updatedOrder.invoiceNumber || updatedOrder._id}`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #4F46E5;">Thank You for Your Order!</h2>
                        <p>Hi ${order.user.name},</p>
                        <p>We are excited to let you know that we have received your payment and your order <strong>#${updatedOrder.invoiceNumber || updatedOrder._id}</strong> is being processed.</p>
                        
                        <div style="background-color: #F3F4F6; padding: 15px; margin: 20px 0; border-radius: 8px;">
                            <p style="margin: 0; font-weight: bold;">Order Summary</p>
                            <p style="margin: 5px 0 0 0;">Total Amount: <strong>Rs. ${updatedOrder.totalPrice.toFixed(2)}</strong></p>
                            <p style="margin: 5px 0 0 0;">Payment Status: <strong style="color: #10B981;">PAID</strong></p>
                        </div>

                        <p>You can track your order status by clicking the button below:</p>
                        <p style="margin-top: 20px;">
                            <a href="http://localhost:5173/order/${updatedOrder._id}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Order</a>
                        </p>

                        <p style="color: #666; font-size: 12px; margin-top: 30px;">
                            Please find your invoice attached to this email.
                        </p>
                    </div>
                `,
                attachments: [
                    {
                        filename: `invoice-${updatedOrder.invoiceNumber || updatedOrder._id}.pdf`,
                        content: invoiceBase64
                    }
                ]
            });
        } catch (error) {
            console.error("Failed to prepare/send email/invoice:", error);
        }
        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// ... verify updateOrderToDelivered is correct ...

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
const cancelOrder = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user', 'name email');

    if (order) {
        if (order.isDelivered) {
            res.status(400);
            throw new Error('Cannot cancel an order that has been shipped or delivered');
        }

        if (order.isCancelled) {
            res.status(400);
            throw new Error('Order is already cancelled');
        }

        const oldStatus = order.status;
        order.isCancelled = true;
        order.status = 'CANCELLED';
        order.cancelledAt = Date.now();

        await AuditLog.create({
            orderId: order._id,
            statusFrom: oldStatus,
            statusTo: 'CANCELLED',
            action: 'ORDER_CANCELLED',
            performedBy: {
                id: req.user._id,
                name: req.user.name,
                role: req.user.role
            },
            reason: req.body.reason || 'User/Admin requested cancellation'
        });

        const updatedOrder = await order.save();

        // Restore Stock
        const stockRestoration = order.orderItems.map(async (item) => {
            const product = await Product.findById(item.product);
            if (product) {
                product.countInStock += item.qty;
                await product.save();
            }
        });

        await Promise.all(stockRestoration);

        // --- SEND CANCELLATION EMAIL ---
        try {
            await sendEmail({
                to: order.user.email,
                subject: `Order Cancelled: #${updatedOrder.invoiceNumber || updatedOrder._id}`,
                html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #EF4444;">Order Cancelled</h2>
                            <p>Hi ${order.user.name},</p>
                            <p>Your order <strong>#${updatedOrder.invoiceNumber || updatedOrder._id}</strong> has been successfully cancelled as per your request.</p>
                            
                            <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 15px; margin: 20px 0;">
                                <p style="margin: 0; color: #B91C1C; font-weight: bold;">Refund Information</p>
                                <p style="margin: 10px 0 0 0; color: #7F1D1D;">
                                    Your payment of <strong>Rs. ${updatedOrder.totalPrice.toFixed(2)}</strong> will be refunded to your original payment method within the next <strong>7 working days</strong>.
                                </p>
                            </div>

                            <p style="color: #666; font-size: 12px; margin-top: 30px;">
                                If you did not request this cancellation or have any questions, please reply to this email immediately.
                            </p>
                        </div>
                    `
            });
            console.log(`Cancellation email sent to ${order.user.email}`);
        } catch (error) {
            console.error("Failed to send cancellation email:", error);
        }

        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});
const addOrderItems = asyncHandler(async (req, res) => {
    const {
        orderItems,
        shippingAddress,
        paymentMethod,
        itemsPrice,
        taxPrice,
        shippingPrice,
        totalPrice
    } = req.body;

    if (orderItems && orderItems.length === 0) {
        res.status(400);
        throw new Error('No order items');
    } else {
        let maxDeliveryDays = 0;
        const stockUpdatedItems = [];

        try {
            // 1. Verify Stock & Deduct Atomically
            for (const item of orderItems) {
                const product = await Product.findById(item.product);
                if (!product) {
                    res.status(404);
                    throw new Error(`Product not found: ${item.name}`);
                }

                // Check Delivery Days
                if (product.estimatedDeliveryDays > maxDeliveryDays) {
                    maxDeliveryDays = product.estimatedDeliveryDays;
                }

                // CHECK AND UPDATE STOCK
                const shouldEnforceStock = product.isStockEnabled !== false; // Default true

                if (shouldEnforceStock) {
                    // Attempt to atomically decrement stock ONLY IF sufficient stock exists
                    const updatedProduct = await Product.findOneAndUpdate(
                        { _id: item.product, countInStock: { $gte: item.qty } },
                        { $inc: { countInStock: -item.qty } },
                        { new: true }
                    );

                    if (!updatedProduct) {
                        res.status(400);
                        throw new Error(`Insufficient stock for ${item.name}. Stock changed during checkout.`);
                    }

                    // Track successful deduction for potential rollback
                    stockUpdatedItems.push({ id: item.product, qty: item.qty });
                }
            }

            // 2. Create Order
            const expectedDeliveryDate = new Date();
            expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + (maxDeliveryDays || 5));

            const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
            const invoiceNumber = `INV-${randomStr}`;

            const order = new Order({
                orderItems,
                user: req.user._id,
                invoiceNumber,
                shippingAddress,
                paymentMethod,
                itemsPrice,
                taxPrice,
                shippingPrice,
                totalPrice,
                expectedDeliveryDate
            });

            const createdOrder = await order.save();
            res.status(201).json(createdOrder);

        } catch (error) {
            // ROLLBACK: If any error occurs (stock check failed, or order save failed), refund the deducted stock
            console.error("Order creation failed, rolling back stock:", error.message);
            for (const item of stockUpdatedItems) {
                await Product.findByIdAndUpdate(item.id, { $inc: { countInStock: item.qty } });
            }
            throw error; // Propagate error to asyncHandler
        }
    }
});

// @desc    Update order expected delivery date
// @route   PUT /api/orders/:id/delivery-date
// @access  Private/Admin
const updateOrderEstimatedDelivery = asyncHandler(async (req, res) => {
    const { date } = req.body;
    const order = await Order.findById(req.params.id);

    if (order) {
        order.expectedDeliveryDate = date;
        const updatedOrder = await order.save();
        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
        .populate('user', 'name email phoneNumber');

    if (order) {
        res.json(order);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});



// @desc    Create payment intent (Stripe)
// @route   POST /api/orders/create-payment-intent
// @access  Private
const createPaymentIntent = asyncHandler(async (req, res) => {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const { amount } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
    });

    res.send({
        clientSecret: paymentIntent.client_secret,
    });
});

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id });
    res.json(orders);
});

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = asyncHandler(async (req, res) => {
    const orders = await Order.find({}).populate('user', 'id name phoneNumber').sort({ createdAt: -1 });
    res.json(orders);
});

// @desc    Update order to delivered
// @route   PUT /api/orders/:id/deliver
// @access  Private/Admin
const updateOrderToDelivered = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (order) {
        const oldStatus = order.status;
        order.isDelivered = true;
        order.status = 'DELIVERED';
        order.deliveredAt = Date.now();

        await AuditLog.create({
            orderId: order._id,
            statusFrom: oldStatus,
            statusTo: 'DELIVERED',
            action: 'STATUS_UPDATE',
            performedBy: {
                id: req.user._id,
                name: req.user.name,
                role: 'admin'
            },
            note: 'Marked as delivered by admin'
        });

        const updatedOrder = await order.save();

        // --- SEND DELIVERY EMAIL ---
        try {
            // Fetch user email if not populated
            const populatedOrder = await Order.findById(updatedOrder._id).populate('user', 'name email');

            await sendEmail({
                to: populatedOrder.user.email,
                subject: `Order Delivered: #${updatedOrder.invoiceNumber || updatedOrder._id}`,
                html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #10B981;">Your Order Has Been Delivered!</h2>
                            <p>Hi ${populatedOrder.user.name},</p>
                            <p>Good news! Your order <strong>#${updatedOrder.invoiceNumber || updatedOrder._id}</strong> has been delivered.</p>
                            
                            <p>We hope you love your purchase. If you have any feedback or issues, please don't hesitate to reach out.</p>

                            <p style="margin-top: 20px;">
                                <a href="http://localhost:5173/order/${updatedOrder._id}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Order Details</a>
                            </p>

                            <p style="color: #666; font-size: 12px; margin-top: 30px;">
                                Thank you for shopping with Barlina Fashion.
                            </p>
                        </div>
                    `
            });
            console.log(`Delivery email sent to ${populatedOrder.user.email}`);
        } catch (error) {
            console.error("Failed to send delivery email:", error);
        }

        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});



// @desc    Get order by invoice number or ID
// @route   GET /api/orders/invoice/:invoiceNumber
// @access  Private/Admin
const getOrderByInvoiceNumber = asyncHandler(async (req, res) => {
    const term = req.params.invoiceNumber;

    // 1. Try finding by Invoice Number first
    let order = await Order.findOne({ invoiceNumber: term })
        .populate('user', 'name email phoneNumber');

    // 2. If not found, try partial ID match (at least 6 characters)
    if (!order && term.length >= 6) {
        // Find all orders and filter by start of ID string (since we can't regex the ObjectId type easily)
        const allOrders = await Order.find({}).populate('user', 'name email phoneNumber');
        order = allOrders.find(o => o._id.toString().startsWith(term.toLowerCase()));
    }

    // 3. Fallback: Full ObjectId match
    if (!order && mongoose.Types.ObjectId.isValid(term)) {
        order = await Order.findById(term)
            .populate('user', 'name email phoneNumber');
    }

    if (order) {
        res.json(order);
    } else {
        res.status(404);
        throw new Error('Order not found with this Invoice number or ID');
    }
});

// @desc    Update order status (Admin)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status, note, courier } = req.body;
    const order = await Order.findById(req.params.id);

    if (order) {
        const oldStatus = order.status;

        // Define forbidden transitions if needed, but for now rely on Admin judgement + UI restrictions
        // Validate strictly against enum
        const allowedStatuses = ['CREATED', 'PAID', 'PAYMENT_FAILED', 'READY_TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'];
        if (!allowedStatuses.includes(status)) {
            res.status(400);
            throw new Error('Invalid status value');
        }

        order.status = status;

        // Sync legacy flags
        if (status === 'PAID') {
            order.isPaid = true;
            if (!order.paidAt) order.paidAt = Date.now();
        }
        if (status === 'DELIVERED') {
            order.isDelivered = true;
            if (!order.deliveredAt) order.deliveredAt = Date.now();
        }
        if (status === 'CANCELLED') {
            order.isCancelled = true;
            if (!order.cancelledAt) order.cancelledAt = Date.now();
        }

        if (status === 'OUT_FOR_DELIVERY') {
            // --- SEND OUT FOR DELIVERY EMAIL ---
            try {
                // Ensure user is populated
                const populatedOrder = (req.user && req.user.email) ? order : await Order.findById(order._id).populate('user', 'name email');
                const user = populatedOrder.user;

                await sendEmail({
                    to: user.email,
                    subject: `Out for Delivery: Order #${order.invoiceNumber || order._id}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #F59E0B;">Your Order is Out for Delivery!</h2>
                            <p>Hi ${user.name},</p>
                            <p>Your order <strong>#${order.invoiceNumber || order._id}</strong> is out for delivery today.</p>
                            <p>Our courier partner will be arriving soon. Please ensure someone is available to receive the package.</p>
                            
                            ${courier ? `
                            <div style="background-color: #FEF3C7; padding: 15px; margin: 20px 0; border-radius: 8px;">
                                <p style="margin: 0; font-weight: bold;">Courier Details</p>
                                <p style="margin: 5px 0 0 0;">Partner: ${courier.name || 'N/A'}</p>
                                <p style="margin: 5px 0 0 0;">Tracking ID: ${courier.trackingId || 'N/A'}</p>
                            </div>
                            ` : ''}

                            <p style="margin-top: 20px;">
                                <a href="http://localhost:5173/order/${order._id}" style="background-color: #F59E0B; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Track Order</a>
                            </p>
                        </div>
                    `
                });
                console.log(`Out for delivery email sent to ${user.email}`);
            } catch (error) {
                console.error("Failed to send out for delivery email:", error);
            }
        }

        // Logic to Auto-Generate Return Requests if Order Status is set to 'RETURNED'
        if (status === 'RETURNED') {
            console.log(`[OrderController] Auto-generating returns for Order ${order._id}`);
            for (const item of order.orderItems) {
                try {
                    // Check if a return request already exists for this item
                    const existingReturn = item.returnRequestId ||
                        (await ReturnRequest.findOne({ order: order._id, 'orderItem.product': item.product }));

                    if (!existingReturn) {
                        console.log(`[OrderController] Creating return for item ${item.name}`);
                        const newReturn = await ReturnRequest.create({
                            order: order._id,
                            user: order.user,
                            orderItem: {
                                product: item.product,
                                name: item.name,
                                image: item.image || 'https://via.placeholder.com/150',
                                price: item.price,
                                qty: item.qty
                            },
                            reason: 'OTHER',
                            comments: 'Admin manually updated order status to RETURNED',
                            status: 'APPROVED',
                            history: [{ status: 'APPROVED', updatedBy: req.user._id, note: 'Auto-created by Order Status Update' }]
                        });

                        item.returnStatus = 'APPROVED';
                        item.returnRequestId = newReturn._id;
                    } else {
                        console.log(`[OrderController] Return already exists for item ${item.name}`);
                        // Ensure status consistency
                        if (!item.returnStatus || item.returnStatus === 'NONE') {
                            item.returnStatus = 'APPROVED';
                        }
                    }
                } catch (err) {
                    console.error(`[OrderController] Failed to auto-create return for item ${item.name}:`, err);
                }
            }
        }

        // Handle courier info updates if status is SHIPPED
        if (courier) {
            order.courier = {
                ...order.courier,
                ...courier
            };
            if (status === 'SHIPPED' && !order.courier.shippedAt) {
                order.courier.shippedAt = Date.now();
            }
        }

        const updatedOrder = await order.save();

        // Audit Log
        await AuditLog.create({
            orderId: order._id,
            statusFrom: oldStatus,
            statusTo: status,
            action: 'STATUS_UPDATE',
            performedBy: {
                id: req.user._id,
                name: req.user.name,
                role: 'admin'
            },
            note: note || `Status updated to ${status}`,
            metadata: { courier }
        });

        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Get order audit logs
// @route   GET /api/orders/:id/audit
// @access  Private/Admin
const getOrderAuditLogs = asyncHandler(async (req, res) => {
    const logs = await AuditLog.find({ orderId: req.params.id }).sort({ createdAt: -1 });
    res.json(logs);
});

// @desc    Bulk update order status
// @route   POST /api/orders/bulk-status
// @access  Private/Admin
const updateOrdersStatusBulk = asyncHandler(async (req, res) => {
    const { orderIds, status, note } = req.body;

    if (!orderIds || orderIds.length === 0) {
        res.status(400);
        throw new Error('No orders selected');
    }

    const orders = await Order.find({ _id: { $in: orderIds } });

    const results = await Promise.all(orders.map(async (order) => {
        const oldStatus = order.status;
        order.status = status;

        // Sync legacy flags
        if (status === 'PAID') {
            order.isPaid = true;
            if (!order.paidAt) order.paidAt = Date.now();
        }
        if (status === 'DELIVERED') {
            order.isDelivered = true;
            if (!order.deliveredAt) order.deliveredAt = Date.now();
        }
        // Bulk cancellation not supported here for safety (use single cancel)

        await order.save();

        await AuditLog.create({
            orderId: order._id,
            statusFrom: oldStatus,
            statusTo: status,
            action: 'BULK_STATUS_UPDATE',
            performedBy: {
                id: req.user._id,
                name: req.user.name,
                role: 'admin'
            },
            note: note || `Bulk status update to ${status}`
        });

        return order._id;
    }));

    res.json({ message: `Scussessfully updated ${results.length} orders`, updatedIds: results });
});

const Complaint = require('../models/Complaint');

// ... existing code ...

// @desc    Get order statistics (Admin Dashboard)
// @route   GET /api/orders/analytics/stats
// @access  Private/Admin
// @desc    Get order statistics (Admin Dashboard)
// @route   GET /api/orders/analytics/stats
// @access  Private/Admin
const getOrderStats = asyncHandler(async (req, res) => {
    // console.log("[Stats] Starting getOrderStats...");

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
        statusCountsResult,
        dailyStats,
        totalRevenueResult,
        returnsPending,
        openComplaints,
        totalOrders,
        recentOrders
    ] = await Promise.all([
        // 1. Status Counts
        Order.aggregate([
            {
                $addFields: {
                    normalizedStatus: {
                        $cond: {
                            if: { $ifNull: ["$status", false] },
                            then: "$status",
                            else: {
                                $switch: {
                                    branches: [
                                        { case: { $eq: ["$isCancelled", true] }, then: "CANCELLED" },
                                        { case: { $eq: ["$isDelivered", true] }, then: "DELIVERED" },
                                        { case: { $eq: ["$isPaid", true] }, then: "PAID" }
                                    ],
                                    default: "CREATED"
                                }
                            }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$normalizedStatus',
                    count: { $sum: 1 }
                }
            }
        ]),

        // 2. Daily Stats
        Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    isCancelled: false
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    orders: { $sum: 1 },
                    sales: { $sum: "$totalPrice" }
                }
            },
            { $sort: { _id: 1 } }
        ]),

        // 3. Total Revenue
        Order.aggregate([
            {
                $match: {
                    isPaid: true,
                    isCancelled: false
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$totalPrice' }
                }
            }
        ]),

        // 4. Counts
        ReturnRequest.countDocuments({ status: 'REQUESTED' }),
        Complaint.countDocuments({ status: 'Open' }),
        Order.countDocuments({}),

        // 5. Recent Orders
        Order.find({
            status: { $in: ['CREATED', 'PAID', 'READY_TO_SHIP'] },
            isCancelled: false
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('invoiceNumber createdAt totalPrice user status')
            .populate('user', 'name')
            .lean() // Use lean for faster reads
    ]);

    const statusMap = statusCountsResult.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
    }, {});

    res.json({
        statusCounts: statusMap,
        dailyStats,
        totalRevenue: totalRevenueResult[0]?.total || 0,
        totalOrders,
        returnsPending,
        openComplaints,
        recentOrders
    });
});

// @desc    Download order invoice PDF
// @route   GET /api/orders/:id/invoice
// @access  Private
const getOrderInvoice = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user', 'name email address city postalCode country phoneNumber');

    if (order) {
        const generateInvoicePDF = require('../utils/generateInvoice');
        try {
            const invoiceBuffer = await generateInvoicePDF(order, order.user);

            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=invoice-${order.invoiceNumber || order._id}.pdf`,
                'Content-Length': invoiceBuffer.length
            });

            res.send(invoiceBuffer);
        } catch (error) {
            console.error("Invoice Generation Error:", error);
            res.status(500);
            throw new Error('Failed to generate invoice PDF');
        }
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

module.exports = {
    addOrderItems,
    getOrderById,
    updateOrderToPaid,
    updateOrderToDelivered,
    cancelOrder,
    getMyOrders,
    getOrders,
    getOrderByInvoiceNumber,
    createPaymentIntent,
    updateOrderEstimatedDelivery,
    updateOrderStatus,
    getOrderAuditLogs,
    updateOrdersStatusBulk,
    getOrderStats,
    getOrderInvoice
};
