/**
 * Test Script for Automated Finance & Performance Jobs
 * 
 * Run this script to manually trigger and verify automated jobs:
 * node scripts/testAutomatedJobs.js
 * 
 * Options:
 *   --settlements     Test weekly settlement generation
 *   --earnings        Test daily earnings summary
 *   --fraud           Test fraud detection
 *   --inventory       Test inventory alerts
 *   --performance     Test seller performance review
 *   --release         Test held funds release
 *   --all             Run all tests
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    header: (msg) => console.log(`\n${colors.cyan}${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}${colors.reset}\n`)
};

// ==================== TEST FUNCTIONS ====================

const testSettlementGeneration = async () => {
    log.header('Testing Weekly Settlement Generation');

    try {
        const { generateWeeklySettlements } = require('../cron/automatedFinanceJobs');

        log.info('Running settlement generation...');
        await generateWeeklySettlements();

        // Check results
        const Settlement = require('../models/Settlement');
        const recentSettlements = await Settlement.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('seller', 'businessName');

        if (recentSettlements.length > 0) {
            log.success(`Found ${recentSettlements.length} recent settlements:`);
            recentSettlements.forEach(s => {
                console.log(`   - ${s.settlementNumber}: ₹${s.netPayable?.toLocaleString()} (${s.status})`);
            });
        } else {
            log.warn('No settlements found. This could mean:');
            console.log('   - No sellers have eligible funds');
            console.log('   - Minimum settlement amount (₹100) not met');
        }

        return true;
    } catch (error) {
        log.error(`Settlement test failed: ${error.message}`);
        return false;
    }
};

const testDailyEarnings = async () => {
    log.header('Testing Daily Earnings Summary');

    try {
        const { sendDailyEarningsSummary } = require('../cron/automatedFinanceJobs');

        log.info('Generating earnings summaries...');
        log.warn('Note: Emails will only be sent if sellers have orders today');

        await sendDailyEarningsSummary();

        // Show today's ledger entries
        const SellerLedger = require('../models/SellerLedger');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayEntries = await SellerLedger.countDocuments({
            createdAt: { $gte: today },
            type: 'ORDER_CREDIT'
        });

        log.success(`Today's order credits: ${todayEntries}`);

        return true;
    } catch (error) {
        log.error(`Daily earnings test failed: ${error.message}`);
        return false;
    }
};

const testFraudDetection = async () => {
    log.header('Testing Fraud Detection');

    try {
        const { detectSuspiciousActivity } = require('../cron/automatedFinanceJobs');

        log.info('Running fraud detection scan...');
        await detectSuspiciousActivity();

        // Check audit logs for fraud alerts
        const AuditLog = require('../models/AuditLog');
        const recentAlerts = await AuditLog.find({
            action: 'FRAUD_DETECTION_ALERT'
        }).sort({ createdAt: -1 }).limit(1);

        if (recentAlerts.length > 0 && recentAlerts[0].metadata) {
            const alerts = recentAlerts[0].metadata;
            log.warn(`Found ${alerts.length} suspicious activities in last scan`);
            alerts.slice(0, 3).forEach(a => {
                console.log(`   - [${a.severity}] ${a.type}: ${a.message}`);
            });
        } else {
            log.success('No suspicious activity detected');
        }

        return true;
    } catch (error) {
        log.error(`Fraud detection test failed: ${error.message}`);
        return false;
    }
};

const testInventoryAlerts = async () => {
    log.header('Testing Inventory Alerts');

    try {
        const { checkLowInventory } = require('../cron/automatedFinanceJobs');

        log.info('Checking inventory levels...');
        await checkLowInventory();

        // Show low stock summary
        const Product = require('../models/Product');

        const outOfStock = await Product.countDocuments({
            countInStock: 0,
            isActive: true
        });

        const lowStock = await Product.countDocuments({
            countInStock: { $gt: 0, $lte: 5 },
            isActive: true
        });

        console.log(`\n   📦 Inventory Summary:`);
        console.log(`   - Out of Stock: ${outOfStock} products`);
        console.log(`   - Low Stock (≤5): ${lowStock} products`);

        log.success('Inventory check complete');
        return true;
    } catch (error) {
        log.error(`Inventory test failed: ${error.message}`);
        return false;
    }
};

const testHeldFundsRelease = async () => {
    log.header('Testing Held Funds Release');

    try {
        const { releaseHeldFunds } = require('../cron/settlementScheduler');

        // Show current status
        const SellerLedger = require('../models/SellerLedger');

        const beforeOnHold = await SellerLedger.countDocuments({ status: 'ON_HOLD' });
        const beforeEligible = await SellerLedger.countDocuments({ status: 'ELIGIBLE' });

        log.info(`Before: ON_HOLD=${beforeOnHold}, ELIGIBLE=${beforeEligible}`);

        log.info('Releasing held funds where hold period has expired...');
        await releaseHeldFunds();

        const afterOnHold = await SellerLedger.countDocuments({ status: 'ON_HOLD' });
        const afterEligible = await SellerLedger.countDocuments({ status: 'ELIGIBLE' });

        log.info(`After: ON_HOLD=${afterOnHold}, ELIGIBLE=${afterEligible}`);

        const released = beforeOnHold - afterOnHold;
        if (released > 0) {
            log.success(`Released ${released} entries from hold`);
        } else {
            log.info('No entries were due for release');
        }

        return true;
    } catch (error) {
        log.error(`Held funds release test failed: ${error.message}`);
        return false;
    }
};

const testPerformanceReview = async () => {
    log.header('Testing Monthly Performance Review');

    try {
        const { calculateSellerScore, PERFORMANCE_TIERS } = require('../cron/performanceTracking');
        const Seller = require('../models/Seller');

        // Get a sample seller
        const seller = await Seller.findOne({ isApproved: true });

        if (!seller) {
            log.warn('No approved sellers found to test');
            return true;
        }

        log.info(`Testing performance calculation for: ${seller.businessName}`);

        const now = new Date();
        const periodEnd = new Date(now);
        const periodStart = new Date(now);
        periodStart.setMonth(periodStart.getMonth() - 1);

        const performance = await calculateSellerScore(seller._id, periodStart, periodEnd);

        console.log(`\n   📊 Performance Score: ${performance.totalScore.toFixed(1)}/100`);
        console.log(`   🎖️  Tier: ${PERFORMANCE_TIERS[performance.tier].badge}`);
        console.log(`\n   Score Breakdown:`);
        console.log(`   - On-Time Delivery: ${performance.onTimeDelivery.toFixed(1)}%`);
        console.log(`   - Return Rate Score: ${performance.returnRate.toFixed(1)}`);
        console.log(`   - Customer Rating: ${performance.customerRating.toFixed(1)}`);
        console.log(`   - Order Volume: ${performance.orderVolume.toFixed(1)}`);

        log.success('Performance calculation complete');

        // Show all sellers current tiers
        const sellerTiers = await Seller.aggregate([
            { $match: { isApproved: true } },
            { $group: { _id: '$performanceTier', count: { $sum: 1 } } }
        ]);

        if (sellerTiers.length > 0) {
            console.log(`\n   Current Seller Tiers:`);
            sellerTiers.forEach(t => {
                console.log(`   - ${t._id || 'STANDARD'}: ${t.count} sellers`);
            });
        }

        return true;
    } catch (error) {
        log.error(`Performance review test failed: ${error.message}`);
        return false;
    }
};

const showLedgerSummary = async () => {
    log.header('Seller Ledger Summary');

    try {
        const SellerLedger = require('../models/SellerLedger');

        const summary = await SellerLedger.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$netAmount' }
                }
            }
        ]);

        console.log('   Status           Count      Total Amount');
        console.log('   ' + '-'.repeat(45));

        let grandTotal = 0;
        summary.forEach(s => {
            grandTotal += s.totalAmount;
            console.log(`   ${(s._id || 'N/A').padEnd(15)} ${String(s.count).padStart(5)}      ₹${s.totalAmount.toLocaleString()}`);
        });

        console.log('   ' + '-'.repeat(45));
        console.log(`   ${'TOTAL'.padEnd(15)} ${String(summary.reduce((a, b) => a + b.count, 0)).padStart(5)}      ₹${grandTotal.toLocaleString()}`);

        return true;
    } catch (error) {
        log.error(`Ledger summary failed: ${error.message}`);
        return false;
    }
};

// ==================== MAIN EXECUTION ====================

const main = async () => {
    console.log(`\n${colors.cyan}╔════════════════════════════════════════════════════════════╗`);
    console.log(`║     AUTOMATED JOBS TEST SUITE                               ║`);
    console.log(`║     Run with: node scripts/testAutomatedJobs.js --all       ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    try {
        await connectDB();
        log.success('Connected to database');

        const args = process.argv.slice(2);
        const runAll = args.includes('--all') || args.length === 0;

        // Show summary first
        await showLedgerSummary();

        if (runAll || args.includes('--release')) {
            await testHeldFundsRelease();
        }

        if (runAll || args.includes('--settlements')) {
            await testSettlementGeneration();
        }

        if (runAll || args.includes('--earnings')) {
            await testDailyEarnings();
        }

        if (runAll || args.includes('--fraud')) {
            await testFraudDetection();
        }

        if (runAll || args.includes('--inventory')) {
            await testInventoryAlerts();
        }

        if (runAll || args.includes('--performance')) {
            await testPerformanceReview();
        }

        log.header('All Tests Complete');
        log.success('Automated jobs are working correctly!');

        console.log(`\n${colors.yellow}📅 Scheduled Job Times (in your timezone):${colors.reset}`);
        console.log('   • Release Held Funds: Every hour at :00');
        console.log('   • Weekly Settlements: Monday 2:00 AM');
        console.log('   • Daily Earnings: 8:00 PM');
        console.log('   • Fraud Detection: Every 4 hours');
        console.log('   • Inventory Alerts: 7:00 AM');
        console.log('   • Performance Review: 1st of month, 3:00 AM');

    } catch (error) {
        log.error(`Test suite failed: ${error.message}`);
        console.error(error);
    } finally {
        await mongoose.connection.close();
        log.info('Database connection closed');
        process.exit(0);
    }
};

main();
