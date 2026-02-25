/**
 * Settlement Cron Jobs
 * Handles automated financial tasks:
 * 1. Release held funds after return window expires
 * 2. Generate periodic settlement reports
 */

const cron = require('node-cron');
const SellerLedger = require('../models/SellerLedger');
const Settlement = require('../models/Settlement');
const Seller = require('../models/Seller');
const AuditLog = require('../models/AuditLog');

/**
 * Release Held Funds Job
 * Runs every hour to check for funds that have passed their hold period
 * and marks them as ELIGIBLE for settlement
 */
const releaseHeldFunds = async () => {
    try {
        const now = new Date();

        // Find all ON_HOLD entries where holdUntil has passed
        const result = await SellerLedger.updateMany(
            {
                status: 'ON_HOLD',
                holdUntil: { $lte: now }
            },
            {
                $set: { status: 'ELIGIBLE' }
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`[Settlement Cron] Released ${result.modifiedCount} held fund entries`);

            // Create audit log
            await AuditLog.create({
                action: 'HELD_FUNDS_RELEASED',
                performedBy: { id: null, name: 'System', role: 'system' },
                note: `Automatically released ${result.modifiedCount} held fund entries`
            });
        }
    } catch (error) {
        console.error('[Settlement Cron] Error releasing held funds:', error);
    }
};

/**
 * Settlement Summary Job
 * Runs daily at midnight to generate summary of pending settlements
 */
const generateSettlementSummary = async () => {
    try {
        // Get all sellers with eligible funds
        const sellersWithFunds = await SellerLedger.aggregate([
            { $match: { status: 'ELIGIBLE' } },
            {
                $group: {
                    _id: '$seller',
                    totalEligible: { $sum: '$netAmount' },
                    entryCount: { $sum: 1 }
                }
            },
            {
                $match: { totalEligible: { $gt: 100 } } // Minimum ₹100 for settlement
            }
        ]);

        if (sellersWithFunds.length > 0) {
            console.log(`[Settlement Cron] ${sellersWithFunds.length} sellers have funds ready for settlement`);

            // Log summary
            for (const seller of sellersWithFunds) {
                const sellerDoc = await Seller.findById(seller._id);
                console.log(`  - ${sellerDoc?.businessName || seller._id}: ₹${seller.totalEligible.toFixed(2)} (${seller.entryCount} transactions)`);
            }
        }
    } catch (error) {
        console.error('[Settlement Cron] Error generating summary:', error);
    }
};

/**
 * Mark Stale Orders Job
 * Runs daily to identify orders stuck in processing
 */
const checkStaleOrders = async () => {
    try {
        const Order = require('../models/Order');
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        // Find orders that are PAID but not shipped for 3+ days
        const staleOrders = await Order.countDocuments({
            status: 'PAID',
            isPaid: true,
            isDelivered: false,
            paidAt: { $lte: threeDaysAgo }
        });

        if (staleOrders > 0) {
            console.warn(`[Settlement Cron] ⚠️ ${staleOrders} orders are PAID but not shipped for 3+ days`);
        }
    } catch (error) {
        console.error('[Settlement Cron] Error checking stale orders:', error);
    }
};

/**
 * Schedule all settlement-related cron jobs
 */
const scheduleSettlementJobs = () => {
    // Release held funds - every hour at minute 0
    cron.schedule('0 * * * *', () => {
        console.log('[Settlement Cron] Running release held funds job...');
        releaseHeldFunds();
    });

    // Settlement summary - daily at 6 AM
    cron.schedule('0 6 * * *', () => {
        console.log('[Settlement Cron] Running settlement summary job...');
        generateSettlementSummary();
    });

    // Stale orders check - daily at 9 AM
    cron.schedule('0 9 * * *', () => {
        console.log('[Settlement Cron] Running stale orders check...');
        checkStaleOrders();
    });

    console.log('[Settlement Cron] All settlement jobs scheduled');
};

module.exports = {
    scheduleSettlementJobs,
    releaseHeldFunds,
    generateSettlementSummary,
    checkStaleOrders
};
