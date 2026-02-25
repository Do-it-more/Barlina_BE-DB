/**
 * Automated Seller Performance Tracking & Commission Adjustment
 * 
 * Features:
 * 1. Monthly performance scoring
 * 2. Automatic commission rate adjustment based on performance
 * 3. Badge assignments (Bronze, Silver, Gold, Platinum)
 * 4. Poor performer flagging
 */

const cron = require('node-cron');
const mongoose = require('mongoose');

// Models
const Seller = require('../models/Seller');
const Order = require('../models/Order');
const ReturnRequest = require('../models/ReturnRequest');
const Product = require('../models/Product');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

// Utils
const sendEmail = require('../utils/sendEmail');

// Performance Tiers & Rewards
const PERFORMANCE_TIERS = {
    PLATINUM: {
        minScore: 90,
        commissionReduction: 3, // 3% off base commission
        badge: '💎 Platinum Seller',
        benefits: ['Priority support', '3% lower commission', 'Featured placement']
    },
    GOLD: {
        minScore: 75,
        commissionReduction: 2,
        badge: '🥇 Gold Seller',
        benefits: ['2% lower commission', 'Early access to features']
    },
    SILVER: {
        minScore: 60,
        commissionReduction: 1,
        badge: '🥈 Silver Seller',
        benefits: ['1% lower commission']
    },
    BRONZE: {
        minScore: 40,
        commissionReduction: 0,
        badge: '🥉 Bronze Seller',
        benefits: []
    },
    STANDARD: {
        minScore: 0,
        commissionReduction: 0,
        badge: 'Standard Seller',
        benefits: []
    }
};

// Scoring Weights
const SCORING_WEIGHTS = {
    onTimeDelivery: 25,      // % of orders delivered on time
    returnRate: 25,          // Lower return rate = higher score
    customerRating: 20,      // Average product rating
    orderVolume: 15,         // Number of completed orders
    responseTime: 15         // Average response time to queries
};

/**
 * Calculate seller performance score
 */
const calculateSellerScore = async (sellerId, periodStart, periodEnd) => {
    const scores = {
        onTimeDelivery: 0,
        returnRate: 0,
        customerRating: 0,
        orderVolume: 0,
        responseTime: 0,
        totalScore: 0
    };

    // Get seller's products
    const sellerProducts = await Product.find({ seller: sellerId }).select('_id');
    const productIds = sellerProducts.map(p => p._id);

    if (productIds.length === 0) {
        return { ...scores, tier: 'STANDARD' };
    }

    // 1. On-Time Delivery Rate
    const deliveredOrders = await Order.find({
        'orderItems.product': { $in: productIds },
        status: 'DELIVERED',
        deliveredAt: { $gte: periodStart, $lte: periodEnd }
    });

    const onTimeOrders = deliveredOrders.filter(order => {
        if (!order.expectedDeliveryDate || !order.deliveredAt) return false;
        return new Date(order.deliveredAt) <= new Date(order.expectedDeliveryDate);
    });

    if (deliveredOrders.length > 0) {
        scores.onTimeDelivery = (onTimeOrders.length / deliveredOrders.length) * 100;
    } else {
        scores.onTimeDelivery = 100; // No orders = no penalty
    }

    // 2. Return Rate (inverse - lower is better)
    const returnRequests = await ReturnRequest.countDocuments({
        order: { $in: deliveredOrders.map(o => o._id) },
        status: 'APPROVED',
        createdAt: { $gte: periodStart, $lte: periodEnd }
    });

    if (deliveredOrders.length > 0) {
        const returnRate = (returnRequests / deliveredOrders.length) * 100;
        scores.returnRate = Math.max(0, 100 - (returnRate * 5)); // 20% returns = 0 score
    } else {
        scores.returnRate = 100;
    }

    // 3. Customer Ratings
    const productsWithRatings = await Product.find({
        seller: sellerId,
        numReviews: { $gt: 0 }
    }).select('rating numReviews');

    if (productsWithRatings.length > 0) {
        const totalWeightedRating = productsWithRatings.reduce((sum, p) => sum + (p.rating * p.numReviews), 0);
        const totalReviews = productsWithRatings.reduce((sum, p) => sum + p.numReviews, 0);
        const avgRating = totalWeightedRating / totalReviews;
        scores.customerRating = (avgRating / 5) * 100;
    } else {
        scores.customerRating = 70; // Neutral score for no reviews
    }

    // 4. Order Volume (compared to platform average)
    const totalPlatformOrders = await Order.countDocuments({
        status: 'DELIVERED',
        deliveredAt: { $gte: periodStart, $lte: periodEnd }
    });

    const avgOrdersPerSeller = totalPlatformOrders / (await Seller.countDocuments({ isApproved: true }));

    if (avgOrdersPerSeller > 0) {
        const volumeRatio = deliveredOrders.length / avgOrdersPerSeller;
        scores.orderVolume = Math.min(100, volumeRatio * 50); // Cap at 100
    } else {
        scores.orderVolume = 50;
    }

    // 5. Response Time (placeholder - would need chat/ticket data)
    scores.responseTime = 75; // Default placeholder

    // Calculate weighted total
    scores.totalScore = (
        (scores.onTimeDelivery * SCORING_WEIGHTS.onTimeDelivery) +
        (scores.returnRate * SCORING_WEIGHTS.returnRate) +
        (scores.customerRating * SCORING_WEIGHTS.customerRating) +
        (scores.orderVolume * SCORING_WEIGHTS.orderVolume) +
        (scores.responseTime * SCORING_WEIGHTS.responseTime)
    ) / 100;

    // Determine tier
    let tier = 'STANDARD';
    if (scores.totalScore >= PERFORMANCE_TIERS.PLATINUM.minScore) tier = 'PLATINUM';
    else if (scores.totalScore >= PERFORMANCE_TIERS.GOLD.minScore) tier = 'GOLD';
    else if (scores.totalScore >= PERFORMANCE_TIERS.SILVER.minScore) tier = 'SILVER';
    else if (scores.totalScore >= PERFORMANCE_TIERS.BRONZE.minScore) tier = 'BRONZE';

    return { ...scores, tier };
};

/**
 * Monthly Performance Review & Commission Adjustment
 * Runs on 1st of every month at 3 AM
 */
const runMonthlyPerformanceReview = async () => {
    console.log('[Performance] Starting monthly performance review...');

    try {
        const now = new Date();
        const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
        const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); // First day of previous month

        const activeSellers = await Seller.find({
            isApproved: true,
            isBlocked: { $ne: true }
        });

        console.log(`[Performance] Evaluating ${activeSellers.length} sellers...`);

        const results = {
            upgraded: [],
            downgraded: [],
            unchanged: []
        };

        for (const seller of activeSellers) {
            try {
                const performance = await calculateSellerScore(seller._id, periodStart, periodEnd);
                const previousTier = seller.performanceTier || 'STANDARD';
                const newTier = performance.tier;

                // Calculate new commission rate
                const baseCommission = seller.baseCommissionRate || 10;
                const tierData = PERFORMANCE_TIERS[newTier];
                const newCommission = Math.max(5, baseCommission - tierData.commissionReduction);

                // Update seller
                seller.performanceTier = newTier;
                seller.performanceScore = performance.totalScore;
                seller.commissionPercentage = newCommission;
                seller.lastPerformanceReview = now;
                seller.performanceHistory = seller.performanceHistory || [];
                seller.performanceHistory.push({
                    date: now,
                    score: performance.totalScore,
                    tier: newTier,
                    details: performance
                });

                // Keep only last 12 months of history
                if (seller.performanceHistory.length > 12) {
                    seller.performanceHistory = seller.performanceHistory.slice(-12);
                }

                await seller.save();

                // Track changes
                if (newTier !== previousTier) {
                    const tierOrder = ['STANDARD', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
                    const isUpgrade = tierOrder.indexOf(newTier) > tierOrder.indexOf(previousTier);

                    if (isUpgrade) {
                        results.upgraded.push({ seller, previousTier, newTier, performance });
                    } else {
                        results.downgraded.push({ seller, previousTier, newTier, performance });
                    }

                    // Send notification
                    await sendPerformanceNotification(seller, previousTier, newTier, performance, isUpgrade);
                } else {
                    results.unchanged.push({ seller, tier: newTier, performance });
                }

            } catch (error) {
                console.error(`[Performance] Error processing seller ${seller._id}:`, error.message);
            }
        }

        // Create audit log
        await AuditLog.create({
            action: 'MONTHLY_PERFORMANCE_REVIEW',
            performedBy: { id: null, name: 'System', role: 'system' },
            note: `Reviewed ${activeSellers.length} sellers. Upgraded: ${results.upgraded.length}, Downgraded: ${results.downgraded.length}, Unchanged: ${results.unchanged.length}`
        });

        console.log(`[Performance] Review complete:`);
        console.log(`  📈 Upgraded: ${results.upgraded.length}`);
        console.log(`  📉 Downgraded: ${results.downgraded.length}`);
        console.log(`  ➖ Unchanged: ${results.unchanged.length}`);

        // Notify admins of significant changes
        if (results.downgraded.length > 0) {
            await notifyAdminsOfPerformanceChanges(results);
        }

    } catch (error) {
        console.error('[Performance] Error in monthly review:', error);
    }
};

/**
 * Send performance notification to seller
 */
const sendPerformanceNotification = async (seller, previousTier, newTier, performance, isUpgrade) => {
    try {
        const sellerUser = await User.findOne({
            $or: [{ seller: seller._id }, { email: seller.email }]
        });

        const email = sellerUser?.email || seller.email;
        if (!email) return;

        const tierData = PERFORMANCE_TIERS[newTier];
        const benefitsHtml = tierData.benefits.length > 0
            ? `<ul>${tierData.benefits.map(b => `<li>${b}</li>`).join('')}</ul>`
            : '<p>Keep improving to unlock benefits!</p>';

        const color = isUpgrade ? '#10B981' : '#F59E0B';
        const icon = isUpgrade ? '🎉' : '📊';
        const title = isUpgrade
            ? `Congratulations! You've been upgraded to ${tierData.badge}`
            : `Your performance tier has changed to ${tierData.badge}`;

        await sendEmail({
            to: email,
            subject: `${icon} ${title}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: ${color};">${title}</h2>
                    <p>Hi ${seller.businessName || seller.ownerName},</p>
                    
                    <div style="background-color: #F3F4F6; padding: 20px; margin: 20px 0; border-radius: 8px;">
                        <p style="margin: 0; font-size: 14px; color: #666;">Your Performance Score</p>
                        <p style="margin: 5px 0; font-size: 32px; font-weight: bold; color: ${color};">
                            ${performance.totalScore.toFixed(1)}/100
                        </p>
                        <p style="margin: 10px 0 0 0;">
                            <strong>${PERFORMANCE_TIERS[previousTier].badge}</strong> → <strong>${tierData.badge}</strong>
                        </p>
                    </div>
                    
                    <h3>Score Breakdown</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">On-Time Delivery</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${performance.onTimeDelivery.toFixed(1)}%</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">Return Rate Score</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${performance.returnRate.toFixed(1)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">Customer Rating</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${performance.customerRating.toFixed(1)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">Order Volume</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${performance.orderVolume.toFixed(1)}</td>
                        </tr>
                    </table>
                    
                    <h3>Your Benefits</h3>
                    ${benefitsHtml}
                    
                    ${!isUpgrade ? `
                        <div style="background-color: #FEF3C7; padding: 15px; margin: 20px 0; border-radius: 8px;">
                            <p style="margin: 0; color: #B45309;">
                                <strong>How to improve:</strong> Focus on faster deliveries, reduce returns, and maintain product quality.
                            </p>
                        </div>
                    ` : ''}
                    
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">
                        Performance reviews are conducted monthly based on your previous month's activity.
                    </p>
                </div>
            `
        });

        console.log(`[Performance] Sent notification to ${email}`);
    } catch (error) {
        console.error('[Performance] Failed to send notification:', error.message);
    }
};

/**
 * Notify admins of performance changes
 */
const notifyAdminsOfPerformanceChanges = async (results) => {
    try {
        const admins = await User.find({
            role: { $in: ['super_admin', 'admin'] },
            isActive: { $ne: false }
        }).select('email name');

        const downgradedHtml = results.downgraded.map(d => `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${d.seller.businessName}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${d.previousTier} → ${d.newTier}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${d.performance.totalScore.toFixed(1)}</td>
            </tr>
        `).join('');

        for (const admin of admins) {
            await sendEmail({
                to: admin.email,
                subject: `📊 Monthly Performance Review: ${results.downgraded.length} Sellers Downgraded`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2>Monthly Performance Review Summary</h2>
                        <p>Hi ${admin.name},</p>
                        
                        <div style="display: flex; gap: 20px; margin: 20px 0;">
                            <div style="background-color: #ECFDF5; padding: 15px; border-radius: 8px; flex: 1;">
                                <p style="margin: 0; color: #10B981; font-size: 24px; font-weight: bold;">${results.upgraded.length}</p>
                                <p style="margin: 0; color: #065F46;">Upgraded</p>
                            </div>
                            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; flex: 1;">
                                <p style="margin: 0; color: #F59E0B; font-size: 24px; font-weight: bold;">${results.downgraded.length}</p>
                                <p style="margin: 0; color: #B45309;">Downgraded</p>
                            </div>
                            <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; flex: 1;">
                                <p style="margin: 0; color: #6B7280; font-size: 24px; font-weight: bold;">${results.unchanged.length}</p>
                                <p style="margin: 0; color: #374151;">Unchanged</p>
                            </div>
                        </div>
                        
                        ${results.downgraded.length > 0 ? `
                            <h3>Downgraded Sellers</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr style="background-color: #F3F4F6;">
                                    <th style="padding: 10px; text-align: left;">Seller</th>
                                    <th style="padding: 10px; text-align: left;">Tier Change</th>
                                    <th style="padding: 10px; text-align: left;">Score</th>
                                </tr>
                                ${downgradedHtml}
                            </table>
                        ` : ''}
                        
                        <p style="margin-top: 20px;">
                            <a href="${process.env.FRONTEND_URL}/admin/sellers" 
                               style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                View All Sellers
                            </a>
                        </p>
                    </div>
                `
            });
        }
    } catch (error) {
        console.error('[Performance] Failed to notify admins:', error.message);
    }
};

/**
 * Schedule performance jobs
 */
const schedulePerformanceJobs = () => {
    // Monthly performance review - 1st of every month at 3 AM
    cron.schedule('0 3 1 * *', () => {
        console.log('[Performance] Running monthly performance review...');
        runMonthlyPerformanceReview();
    });

    console.log('[Performance] Performance tracking jobs scheduled');
    console.log('  📊 Monthly review: 1st of each month at 3 AM');
};

module.exports = {
    schedulePerformanceJobs,
    calculateSellerScore,
    runMonthlyPerformanceReview,
    PERFORMANCE_TIERS,
    SCORING_WEIGHTS
};
