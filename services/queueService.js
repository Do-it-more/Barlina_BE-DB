/**
 * Background Job Queue System
 * Uses Bull queue with Redis for async processing
 * Handles: emails, PDF generation, stock updates, notifications
 */

const Queue = require('bull');
const sendEmail = require('../utils/sendEmail');

// Redis connection config
const redisConfig = {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        // For cloud Redis (Upstash, Redis Cloud, etc.)
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined
    }
};

// Create queues
const emailQueue = new Queue('email', redisConfig);
const invoiceQueue = new Queue('invoice', redisConfig);
const stockQueue = new Queue('stock', redisConfig);
const notificationQueue = new Queue('notification', redisConfig);
const settlementQueue = new Queue('settlement', redisConfig);

// ==================== EMAIL QUEUE PROCESSOR ====================
emailQueue.process(async (job) => {
    const { to, subject, html, attachments, template, data } = job.data;

    try {
        await sendEmail({ to, subject, html, attachments });
        console.log(`[Queue] Email sent to ${to}: ${subject}`);
        return { success: true, to, subject };
    } catch (error) {
        console.error(`[Queue] Email failed to ${to}:`, error.message);
        throw error;
    }
});

// ==================== INVOICE QUEUE PROCESSOR ====================
invoiceQueue.process(async (job) => {
    const { orderId, userId, settingsId } = job.data;

    try {
        const Order = require('../models/Order');
        const User = require('../models/User');
        const Setting = require('../models/Setting');
        const generateInvoicePDF = require('../utils/generateInvoice');

        const order = await Order.findById(orderId);
        const user = await User.findById(userId);
        const settings = await Setting.findOne();

        if (!order || !user) {
            throw new Error('Order or User not found');
        }

        const invoiceBuffer = await generateInvoicePDF(order, user, settings);
        const invoiceBase64 = invoiceBuffer.toString('base64');

        // Queue email with invoice attachment
        await emailQueue.add({
            to: user.email,
            subject: `Order Confirmation & Invoice: #${order.invoiceNumber || order._id}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #4F46E5;">Thank You for Your Order!</h2>
                    <p>Hi ${user.name},</p>
                    <p>Your order has been confirmed. Please find your invoice attached.</p>
                    <p><strong>Order ID:</strong> ${order.invoiceNumber || order._id}</p>
                    <p><strong>Total:</strong> ₹${order.totalPrice.toLocaleString()}</p>
                </div>
            `,
            attachments: [{
                filename: `invoice-${order.invoiceNumber || order._id}.pdf`,
                content: invoiceBase64
            }]
        });

        console.log(`[Queue] Invoice generated for order ${orderId}`);
        return { success: true, orderId };
    } catch (error) {
        console.error(`[Queue] Invoice generation failed:`, error.message);
        throw error;
    }
});

// ==================== STOCK QUEUE PROCESSOR ====================
stockQueue.process(async (job) => {
    const { type, productId, quantity, orderId } = job.data;

    try {
        const Product = require('../models/Product');

        if (type === 'DECREMENT') {
            // Atomic decrement with lock
            const result = await Product.findOneAndUpdate(
                { _id: productId, countInStock: { $gte: quantity } },
                { $inc: { countInStock: -quantity } },
                { new: true }
            );

            if (!result) {
                throw new Error(`Insufficient stock for product ${productId}`);
            }

            console.log(`[Queue] Stock decremented: ${productId} by ${quantity}`);
        } else if (type === 'INCREMENT') {
            // For returns/cancellations
            await Product.findByIdAndUpdate(productId, {
                $inc: { countInStock: quantity }
            });

            console.log(`[Queue] Stock incremented: ${productId} by ${quantity}`);
        }

        return { success: true, productId, type, quantity };
    } catch (error) {
        console.error(`[Queue] Stock update failed:`, error.message);
        throw error;
    }
});

// ==================== NOTIFICATION QUEUE PROCESSOR ====================
notificationQueue.process(async (job) => {
    const { userId, type, title, message, link, data } = job.data;

    try {
        const Notification = require('../models/Notification');

        await Notification.create({
            recipient: userId,
            type: type || 'INFO',
            title,
            message,
            link,
            metadata: data
        });

        console.log(`[Queue] Notification created for user ${userId}`);
        return { success: true, userId, title };
    } catch (error) {
        console.error(`[Queue] Notification failed:`, error.message);
        throw error;
    }
});

// ==================== SETTLEMENT QUEUE PROCESSOR ====================
settlementQueue.process(async (job) => {
    const { type, sellerId, orderId } = job.data;

    try {
        const commissionService = require('./commissionService');
        const Order = require('../models/Order');

        if (type === 'CREATE_LEDGER_ENTRIES') {
            const order = await Order.findById(orderId);
            if (order) {
                await commissionService.createOrderLedgerEntries(order);
                console.log(`[Queue] Ledger entries created for order ${orderId}`);
            }
        } else if (type === 'MARK_ON_HOLD') {
            const order = await Order.findById(orderId);
            if (order) {
                await commissionService.markEntriesOnHold(order);
                console.log(`[Queue] Ledger entries marked ON_HOLD for order ${orderId}`);
            }
        }

        return { success: true, type, orderId };
    } catch (error) {
        console.error(`[Queue] Settlement task failed:`, error.message);
        throw error;
    }
});

// ==================== ERROR HANDLERS ====================
const queues = [emailQueue, invoiceQueue, stockQueue, notificationQueue, settlementQueue];

queues.forEach(queue => {
    queue.on('failed', (job, err) => {
        console.error(`[Queue] Job failed in ${queue.name}:`, err.message);
        // TODO: Add dead letter queue handling here
    });

    queue.on('completed', (job) => {
        console.log(`[Queue] Job completed in ${queue.name}: ${job.id}`);
    });

    queue.on('stalled', (job) => {
        console.warn(`[Queue] Job stalled in ${queue.name}: ${job.id}`);
    });
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Queue an email to be sent asynchronously
 */
const queueEmail = async (emailData, options = {}) => {
    return emailQueue.add(emailData, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: true,
        ...options
    });
};

/**
 * Queue invoice generation
 */
const queueInvoice = async (orderId, userId) => {
    return invoiceQueue.add({ orderId, userId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true
    });
};

/**
 * Queue stock update
 */
const queueStockUpdate = async (type, productId, quantity, orderId = null) => {
    return stockQueue.add({ type, productId, quantity, orderId }, {
        attempts: 5,
        backoff: { type: 'fixed', delay: 1000 },
        removeOnComplete: true
    });
};

/**
 * Queue notification
 */
const queueNotification = async (userId, title, message, type = 'INFO', link = null) => {
    return notificationQueue.add({ userId, type, title, message, link }, {
        attempts: 3,
        removeOnComplete: true
    });
};

/**
 * Queue settlement task
 */
const queueSettlementTask = async (type, orderId, sellerId = null) => {
    return settlementQueue.add({ type, orderId, sellerId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true
    });
};

/**
 * Check if queue system is available
 */
const isQueueAvailable = async () => {
    try {
        await emailQueue.isReady();
        return true;
    } catch (error) {
        console.warn('[Queue] Redis not available, falling back to sync processing');
        return false;
    }
};

/**
 * Graceful shutdown
 */
const closeQueues = async () => {
    await Promise.all(queues.map(queue => queue.close()));
    console.log('[Queue] All queues closed');
};

module.exports = {
    // Queues (for direct access if needed)
    emailQueue,
    invoiceQueue,
    stockQueue,
    notificationQueue,
    settlementQueue,

    // Helper functions
    queueEmail,
    queueInvoice,
    queueStockUpdate,
    queueNotification,
    queueSettlementTask,
    isQueueAvailable,
    closeQueues
};
