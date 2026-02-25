/**
 * Automated Finance Jobs
 * Handles all automated financial operations:
 * 1. Weekly settlement generation
 * 2. Auto-approval for small settlements
 * 3. Seller notifications
 * 4. Fraud detection
 * 5. Performance analytics
 */

const cron = require('node-cron');
const mongoose = require('mongoose');

// Models
const SellerLedger = require('../models/SellerLedger');
const Settlement = require('../models/Settlement');
const Seller = require('../models/Seller');
const Order = require('../models/Order');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const AuditLog = require('../models/AuditLog');
const Setting = require('../models/Setting');

// Utils
const sendEmail = require('../utils/sendEmail');

// Configuration
const CONFIG = {
    MIN_SETTLEMENT_AMOUNT: Number(process.env.MIN_SETTLEMENT_AMOUNT) || 100,
    AUTO_APPROVE_THRESHOLD: Number(process.env.AUTO_APPROVE_THRESHOLD) || 5000,
    SETTLEMENT_DAY: Number(process.env.SETTLEMENT_DAY) || 1, // Monday = 1
    MAX_DAILY_COUPON_USAGE: Number(process.env.MAX_DAILY_COUPON_USAGE) || 50,
    FRAUD_THRESHOLD_AMOUNT: Number(process.env.FRAUD_THRESHOLD_AMOUNT) || 50000
};

// ==================== AUTOMATED SETTLEMENT GENERATION ====================

/**
 * Generate weekly settlements for all eligible sellers
 * Runs every Monday at 2 AM
 */
const generateWeeklySettlements = async () => {
    console.log('[Auto Finance] Starting weekly settlement generation...');

    try {
        const settings = await Setting.findOne();
        const now = new Date();

        // Period: Last Monday to Last Sunday
        const periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() - periodEnd.getDay()); // Last Sunday
        periodEnd.setHours(23, 59, 59, 999);

        const periodStart = new Date(periodEnd);
        periodStart.setDate(periodStart.getDate() - 6); // Last Monday
        periodStart.setHours(0, 0, 0, 0);

        // Get all sellers with eligible funds
        const eligibleSellers = await SellerLedger.aggregate([
            {
                $match: {
                    status: 'ELIGIBLE',
                    createdAt: { $lte: periodEnd }
                }
            },
            {
                $group: {
                    _id: '$seller',
                    totalAmount: { $sum: '$netAmount' },
                    entryCount: { $sum: 1 },
                    entries: { $push: '$_id' }
                }
            },
            {
                $match: { totalAmount: { $gte: CONFIG.MIN_SETTLEMENT_AMOUNT } }
            }
        ]);

        console.log(`[Auto Finance] Found ${eligibleSellers.length} sellers with eligible funds`);

        let generatedCount = 0;
        let autoApprovedCount = 0;

        for (const sellerData of eligibleSellers) {
            try {
                // Check if settlement already exists for this period
                const existingSettlement = await Settlement.findOne({
                    seller: sellerData._id,
                    periodStart: { $gte: periodStart },
                    periodEnd: { $lte: periodEnd }
                });

                if (existingSettlement) {
                    console.log(`[Auto Finance] Settlement already exists for seller ${sellerData._id}`);
                    continue;
                }

                // Get seller details
                const seller = await Seller.findById(sellerData._id);
                if (!seller || !seller.isApproved || seller.isBlocked) {
                    console.log(`[Auto Finance] Skipping inactive/blocked seller ${sellerData._id}`);
                    continue;
                }

                // Generate settlement
                const settlement = await Settlement.generateSettlement(
                    sellerData._id,
                    periodStart,
                    periodEnd,
                    null // System generated
                );

                generatedCount++;
                console.log(`[Auto Finance] Generated settlement for ${seller.businessName}: ₹${settlement.netPayable}`);

                // AUTO-APPROVE small settlements
                if (settlement.netPayable <= CONFIG.AUTO_APPROVE_THRESHOLD) {
                    settlement.status = 'APPROVED';
                    settlement.approvedBy = null;
                    settlement.approvedAt = new Date();
                    settlement.notes = 'Auto-approved (below threshold)';
                    await settlement.save();

                    autoApprovedCount++;
                    console.log(`[Auto Finance] Auto-approved settlement ${settlement._id}`);
                }

                // Send notification email to seller
                await sendSellerSettlementNotification(seller, settlement);

            } catch (error) {
                console.error(`[Auto Finance] Error processing seller ${sellerData._id}:`, error.message);
            }
        }

        // Create audit log
        await AuditLog.create({
            action: 'AUTO_SETTLEMENT_GENERATION',
            performedBy: { id: null, name: 'System', role: 'system' },
            note: `Generated ${generatedCount} settlements, auto-approved ${autoApprovedCount}`
        });

        console.log(`[Auto Finance] Weekly settlements complete: ${generatedCount} generated, ${autoApprovedCount} auto-approved`);

        // Notify finance admins
        await notifyFinanceAdmins(generatedCount, autoApprovedCount);

    } catch (error) {
        console.error('[Auto Finance] Error in weekly settlement generation:', error);
    }
};

// ==================== SELLER NOTIFICATIONS ====================

/**
 * Send settlement notification to seller
 */
const sendSellerSettlementNotification = async (seller, settlement) => {
    try {
        // Get seller's user account email
        const sellerUser = await User.findOne({
            $or: [
                { seller: seller._id },
                { email: seller.email }
            ]
        });

        const email = sellerUser?.email || seller.email;
        if (!email) return;

        const statusMessage = settlement.status === 'APPROVED'
            ? 'Your settlement has been auto-approved and will be processed shortly.'
            : 'Your settlement is pending approval by our finance team.';

        await sendEmail({
            to: email,
            subject: `💰 Settlement Generated: ₹${settlement.netPayable.toLocaleString()}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #10B981;">Settlement Generated</h2>
                    <p>Hi ${seller.businessName || seller.ownerName},</p>
                    <p>A new settlement has been generated for your account.</p>
                    
                    <div style="background-color: #F3F4F6; padding: 20px; margin: 20px 0; border-radius: 8px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666;">Settlement ID:</td>
                                <td style="padding: 8px 0; font-weight: bold;">${settlement.settlementNumber}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666;">Period:</td>
                                <td style="padding: 8px 0;">${new Date(settlement.periodStart).toLocaleDateString()} - ${new Date(settlement.periodEnd).toLocaleDateString()}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666;">Gross Amount:</td>
                                <td style="padding: 8px 0;">₹${settlement.grossAmount.toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666;">Total Commission:</td>
                                <td style="padding: 8px 0; color: #EF4444;">- ₹${settlement.totalCommission.toLocaleString()}</td>
                            </tr>
                            <tr style="border-top: 2px solid #ccc;">
                                <td style="padding: 12px 0; font-weight: bold; font-size: 18px;">Net Payable:</td>
                                <td style="padding: 12px 0; font-weight: bold; font-size: 18px; color: #10B981;">₹${settlement.netPayable.toLocaleString()}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <p style="color: #666;">${statusMessage}</p>
                    
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">
                        This is an automated notification from your seller dashboard.
                    </p>
                </div>
            `
        });

        console.log(`[Auto Finance] Settlement notification sent to ${email}`);
    } catch (error) {
        console.error('[Auto Finance] Failed to send settlement notification:', error.message);
    }
};

/**
 * Notify finance admins about pending settlements
 */
const notifyFinanceAdmins = async (generatedCount, autoApprovedCount) => {
    try {
        const pendingCount = generatedCount - autoApprovedCount;
        if (pendingCount === 0) return;

        const financeAdmins = await User.find({
            role: { $in: ['super_admin', 'finance'] },
            isActive: { $ne: false }
        }).select('email name');

        for (const admin of financeAdmins) {
            await sendEmail({
                to: admin.email,
                subject: `🔔 ${pendingCount} Settlements Pending Approval`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #F59E0B;">Settlements Require Attention</h2>
                        <p>Hi ${admin.name},</p>
                        <p>The weekly automated settlement generation has completed.</p>
                        
                        <div style="background-color: #FEF3C7; padding: 15px; margin: 20px 0; border-radius: 8px;">
                            <p style="margin: 0;"><strong>${generatedCount}</strong> settlements were generated</p>
                            <p style="margin: 5px 0 0 0;"><strong>${autoApprovedCount}</strong> were auto-approved (below ₹${CONFIG.AUTO_APPROVE_THRESHOLD.toLocaleString()})</p>
                            <p style="margin: 5px 0 0 0; color: #B45309;"><strong>${pendingCount}</strong> require manual approval</p>
                        </div>
                        
                        <p>
                            <a href="${process.env.FRONTEND_URL}/admin/settlements" 
                               style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                Review Settlements
                            </a>
                        </p>
                    </div>
                `
            });
        }
    } catch (error) {
        console.error('[Auto Finance] Failed to notify finance admins:', error.message);
    }
};

// ==================== DAILY EARNINGS SUMMARY ====================

/**
 * Send daily earnings summary to sellers
 * Runs every day at 8 PM
 */
const sendDailyEarningsSummary = async () => {
    console.log('[Auto Finance] Sending daily earnings summaries...');

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Get today's earnings per seller
        const dailyEarnings = await SellerLedger.aggregate([
            {
                $match: {
                    createdAt: { $gte: today, $lt: tomorrow },
                    type: 'ORDER_CREDIT'
                }
            },
            {
                $group: {
                    _id: '$seller',
                    ordersCount: { $sum: 1 },
                    grossEarnings: { $sum: '$grossAmount' },
                    netEarnings: { $sum: '$netAmount' },
                    commission: { $sum: '$commission' }
                }
            },
            {
                $match: { ordersCount: { $gt: 0 } }
            }
        ]);

        let sentCount = 0;

        for (const earnings of dailyEarnings) {
            try {
                const seller = await Seller.findById(earnings._id);
                if (!seller) continue;

                const sellerUser = await User.findOne({
                    $or: [{ seller: seller._id }, { email: seller.email }]
                });

                const email = sellerUser?.email || seller.email;
                if (!email) continue;

                // Get current balance
                const balance = await SellerLedger.getSellerBalance(seller._id);

                await sendEmail({
                    to: email,
                    subject: `📊 Daily Earnings: ₹${earnings.netEarnings.toLocaleString()} from ${earnings.ordersCount} orders`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #4F46E5;">Today's Earnings Summary</h2>
                            <p>Hi ${seller.businessName || seller.ownerName},</p>
                            <p>Here's your earnings summary for ${today.toLocaleDateString()}:</p>
                            
                            <div style="background-color: #EEF2FF; padding: 20px; margin: 20px 0; border-radius: 8px;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0;">Orders Today:</td>
                                        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${earnings.ordersCount}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0;">Gross Earnings:</td>
                                        <td style="padding: 8px 0; text-align: right;">₹${earnings.grossEarnings.toLocaleString()}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0;">Platform Commission:</td>
                                        <td style="padding: 8px 0; text-align: right; color: #EF4444;">- ₹${earnings.commission.toLocaleString()}</td>
                                    </tr>
                                    <tr style="border-top: 2px solid #C7D2FE;">
                                        <td style="padding: 12px 0; font-weight: bold;">Net Earnings:</td>
                                        <td style="padding: 12px 0; font-weight: bold; text-align: right; color: #10B981;">₹${earnings.netEarnings.toLocaleString()}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div style="background-color: #F3F4F6; padding: 15px; margin: 20px 0; border-radius: 8px;">
                                <p style="margin: 0; font-size: 14px; color: #666;">Account Balance</p>
                                <p style="margin: 5px 0 0 0; font-size: 20px; font-weight: bold;">
                                    Available: ₹${balance.availableBalance.toLocaleString()}
                                </p>
                                <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">
                                    On Hold: ₹${balance.onHoldBalance.toLocaleString()}
                                </p>
                            </div>
                            
                            <p style="color: #666; font-size: 12px; margin-top: 30px;">
                                Funds are held for 7 days after delivery to allow for returns.
                            </p>
                        </div>
                    `
                });

                sentCount++;
            } catch (error) {
                console.error(`[Auto Finance] Error sending summary to seller ${earnings._id}:`, error.message);
            }
        }

        console.log(`[Auto Finance] Sent ${sentCount} daily earnings summaries`);
    } catch (error) {
        console.error('[Auto Finance] Error sending daily summaries:', error);
    }
};

// ==================== FRAUD DETECTION ====================

/**
 * Detect and flag suspicious transactions
 * Runs every 4 hours
 */
const detectSuspiciousActivity = async () => {
    console.log('[Auto Finance] Running fraud detection...');

    try {
        const alerts = [];
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // 1. Check for unusually high order values
        const highValueOrders = await Order.find({
            createdAt: { $gte: oneDayAgo },
            totalPrice: { $gte: CONFIG.FRAUD_THRESHOLD_AMOUNT },
            isPaid: true
        }).populate('user', 'name email createdAt');

        for (const order of highValueOrders) {
            // Check if new user with high value order
            const userAge = (now - new Date(order.user.createdAt)) / (1000 * 60 * 60 * 24);
            if (userAge < 7) {
                alerts.push({
                    type: 'HIGH_VALUE_NEW_USER',
                    severity: 'HIGH',
                    orderId: order._id,
                    userId: order.user._id,
                    amount: order.totalPrice,
                    message: `New user (${userAge.toFixed(1)} days old) placed ₹${order.totalPrice.toLocaleString()} order`
                });
            }
        }

        // 2. Check for excessive coupon usage
        const couponAbuse = await Order.aggregate([
            { $match: { createdAt: { $gte: oneDayAgo }, 'coupon.code': { $exists: true } } },
            { $group: { _id: '$user', couponCount: { $sum: 1 }, totalDiscount: { $sum: '$coupon.discountAmount' } } },
            { $match: { couponCount: { $gte: 3 } } }
        ]);

        for (const abuse of couponAbuse) {
            const user = await User.findById(abuse._id).select('name email');
            alerts.push({
                type: 'COUPON_ABUSE',
                severity: 'MEDIUM',
                userId: abuse._id,
                couponCount: abuse.couponCount,
                totalDiscount: abuse.totalDiscount,
                message: `User ${user?.name} used ${abuse.couponCount} coupons in 24 hours (₹${abuse.totalDiscount} discount)`
            });
        }

        // 3. Check for multiple orders to same address from different users
        const addressAbuse = await Order.aggregate([
            { $match: { createdAt: { $gte: oneDayAgo }, isPaid: true } },
            {
                $group: {
                    _id: {
                        street: '$shippingAddress.street',
                        pinCode: '$shippingAddress.pinCode'
                    },
                    userCount: { $addToSet: '$user' },
                    orderCount: { $sum: 1 },
                    totalValue: { $sum: '$totalPrice' }
                }
            },
            { $match: { $expr: { $gt: [{ $size: '$userCount' }, 2] } } }
        ]);

        for (const abuse of addressAbuse) {
            alerts.push({
                type: 'MULTIPLE_USERS_SAME_ADDRESS',
                severity: 'MEDIUM',
                address: abuse._id,
                userCount: abuse.userCount.length,
                orderCount: abuse.orderCount,
                totalValue: abuse.totalValue,
                message: `${abuse.userCount.length} different users ordered to same address (${abuse.orderCount} orders, ₹${abuse.totalValue.toLocaleString()})`
            });
        }

        // 4. Check for rapid order placement (bot detection)
        const rapidOrders = await Order.aggregate([
            { $match: { createdAt: { $gte: oneDayAgo } } },
            {
                $group: {
                    _id: '$user',
                    orderCount: { $sum: 1 },
                    orders: { $push: { time: '$createdAt', id: '$_id' } }
                }
            },
            { $match: { orderCount: { $gte: 10 } } }
        ]);

        for (const rapid of rapidOrders) {
            const user = await User.findById(rapid._id).select('name email');
            alerts.push({
                type: 'RAPID_ORDER_PLACEMENT',
                severity: 'LOW',
                userId: rapid._id,
                orderCount: rapid.orderCount,
                message: `User ${user?.name} placed ${rapid.orderCount} orders in 24 hours`
            });
        }

        // Log alerts
        if (alerts.length > 0) {
            console.log(`[Auto Finance] Detected ${alerts.length} suspicious activities`);

            // Create audit log
            await AuditLog.create({
                action: 'FRAUD_DETECTION_ALERT',
                performedBy: { id: null, name: 'System', role: 'system' },
                note: `Detected ${alerts.length} suspicious activities`,
                metadata: alerts
            });

            // Notify admins
            await notifyAdminsOfFraud(alerts);
        } else {
            console.log('[Auto Finance] No suspicious activity detected');
        }

    } catch (error) {
        console.error('[Auto Finance] Error in fraud detection:', error);
    }
};

/**
 * Notify admins of detected fraud
 */
const notifyAdminsOfFraud = async (alerts) => {
    try {
        const highSeverityAlerts = alerts.filter(a => a.severity === 'HIGH');
        if (highSeverityAlerts.length === 0) return;

        const admins = await User.find({
            role: { $in: ['super_admin', 'admin'] },
            isActive: { $ne: false }
        }).select('email name');

        const alertsHtml = highSeverityAlerts.map(alert => `
            <div style="background-color: #FEE2E2; padding: 10px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #EF4444;">
                <p style="margin: 0; font-weight: bold; color: #B91C1C;">${alert.type}</p>
                <p style="margin: 5px 0 0 0; color: #7F1D1D;">${alert.message}</p>
            </div>
        `).join('');

        for (const admin of admins) {
            await sendEmail({
                to: admin.email,
                subject: `🚨 URGENT: ${highSeverityAlerts.length} High-Severity Fraud Alerts`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #EF4444;">⚠️ Fraud Detection Alert</h2>
                        <p>Hi ${admin.name},</p>
                        <p>The automated fraud detection system has identified the following high-severity issues:</p>
                        
                        ${alertsHtml}
                        
                        <p style="margin-top: 20px;">
                            <a href="${process.env.FRONTEND_URL}/admin/audit-logs" 
                               style="background-color: #EF4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                Review in Dashboard
                            </a>
                        </p>
                        
                        <p style="color: #666; font-size: 12px; margin-top: 30px;">
                            This is an automated security alert. Please investigate these activities promptly.
                        </p>
                    </div>
                `
            });
        }
    } catch (error) {
        console.error('[Auto Finance] Failed to notify admins of fraud:', error.message);
    }
};

// ==================== COUPON USAGE TRACKING ====================

/**
 * Record coupon usage when order is placed
 */
const recordCouponUsage = async (orderId, couponCode, userId) => {
    try {
        if (!couponCode) return;

        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
        if (!coupon) return;

        // Record usage
        await coupon.recordUsage(userId, orderId);
        console.log(`[Auto Finance] Recorded coupon usage: ${couponCode} by user ${userId}`);

    } catch (error) {
        console.error('[Auto Finance] Failed to record coupon usage:', error.message);
    }
};

// ==================== AUTOMATIC INVENTORY ALERTS ====================

/**
 * Check for low stock and notify sellers
 * Runs daily at 7 AM
 */
const checkLowInventory = async () => {
    console.log('[Auto Finance] Checking low inventory...');

    try {
        const Product = require('../models/Product');

        // Find products with low stock
        const lowStockProducts = await Product.find({
            countInStock: { $lte: 5, $gt: 0 },
            isStockEnabled: true,
            isActive: true
        }).populate('seller', 'businessName email');

        const outOfStockProducts = await Product.find({
            countInStock: 0,
            isStockEnabled: true,
            isActive: true
        }).populate('seller', 'businessName email');

        // Group by seller
        const sellerAlerts = {};

        for (const product of [...lowStockProducts, ...outOfStockProducts]) {
            if (!product.seller) continue;

            const sellerId = product.seller._id.toString();
            if (!sellerAlerts[sellerId]) {
                sellerAlerts[sellerId] = {
                    seller: product.seller,
                    lowStock: [],
                    outOfStock: []
                };
            }

            if (product.countInStock === 0) {
                sellerAlerts[sellerId].outOfStock.push(product);
            } else {
                sellerAlerts[sellerId].lowStock.push(product);
            }
        }

        // Send alerts to sellers
        for (const sellerId of Object.keys(sellerAlerts)) {
            const alert = sellerAlerts[sellerId];
            const seller = alert.seller;

            const sellerUser = await User.findOne({
                $or: [{ seller: sellerId }, { email: seller.email }]
            });

            const email = sellerUser?.email || seller.email;
            if (!email) continue;

            const lowStockHtml = alert.lowStock.map(p =>
                `<li>${p.name} - <strong>${p.countInStock} left</strong></li>`
            ).join('');

            const outOfStockHtml = alert.outOfStock.map(p =>
                `<li style="color: #EF4444;">${p.name} - <strong>OUT OF STOCK</strong></li>`
            ).join('');

            await sendEmail({
                to: email,
                subject: `⚠️ Inventory Alert: ${alert.outOfStock.length} out of stock, ${alert.lowStock.length} low stock`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #F59E0B;">Inventory Alert</h2>
                        <p>Hi ${seller.businessName},</p>
                        <p>Some of your products need attention:</p>
                        
                        ${alert.outOfStock.length > 0 ? `
                            <div style="background-color: #FEE2E2; padding: 15px; margin: 15px 0; border-radius: 8px;">
                                <p style="margin: 0 0 10px 0; font-weight: bold; color: #B91C1C;">Out of Stock (${alert.outOfStock.length})</p>
                                <ul style="margin: 0; padding-left: 20px;">${outOfStockHtml}</ul>
                            </div>
                        ` : ''}
                        
                        ${alert.lowStock.length > 0 ? `
                            <div style="background-color: #FEF3C7; padding: 15px; margin: 15px 0; border-radius: 8px;">
                                <p style="margin: 0 0 10px 0; font-weight: bold; color: #B45309;">Low Stock (${alert.lowStock.length})</p>
                                <ul style="margin: 0; padding-left: 20px;">${lowStockHtml}</ul>
                            </div>
                        ` : ''}
                        
                        <p>
                            <a href="${process.env.FRONTEND_URL}/seller/products" 
                               style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                Update Inventory
                            </a>
                        </p>
                    </div>
                `
            });
        }

        console.log(`[Auto Finance] Sent inventory alerts to ${Object.keys(sellerAlerts).length} sellers`);

    } catch (error) {
        console.error('[Auto Finance] Error checking inventory:', error);
    }
};

// ==================== SCHEDULE ALL JOBS ====================

const scheduleAutomatedFinanceJobs = () => {
    // Weekly settlement generation - Every Monday at 2 AM
    cron.schedule('0 2 * * 1', () => {
        console.log('[Auto Finance] Running weekly settlement generation...');
        generateWeeklySettlements();
    });

    // Daily earnings summary - Every day at 8 PM
    cron.schedule('0 20 * * *', () => {
        console.log('[Auto Finance] Running daily earnings summary...');
        sendDailyEarningsSummary();
    });

    // Fraud detection - Every 4 hours
    cron.schedule('0 */4 * * *', () => {
        console.log('[Auto Finance] Running fraud detection...');
        detectSuspiciousActivity();
    });

    // Low inventory check - Every day at 7 AM
    cron.schedule('0 7 * * *', () => {
        console.log('[Auto Finance] Running inventory check...');
        checkLowInventory();
    });

    console.log('[Auto Finance] All automated finance jobs scheduled');
    console.log('  📆 Weekly settlements: Monday 2 AM');
    console.log('  📊 Daily earnings: 8 PM');
    console.log('  🔍 Fraud detection: Every 4 hours');
    console.log('  📦 Inventory alerts: 7 AM');
};

module.exports = {
    scheduleAutomatedFinanceJobs,
    generateWeeklySettlements,
    sendDailyEarningsSummary,
    detectSuspiciousActivity,
    checkLowInventory,
    recordCouponUsage,
    sendSellerSettlementNotification
};
