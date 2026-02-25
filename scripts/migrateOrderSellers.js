/**
 * Migration Script: Populate Seller Info in Existing Orders
 * 
 * This script retroactively adds seller attribution to order items
 * for orders that were created before the seller tracking feature.
 * 
 * Run with: node scripts/migrateOrderSellers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Order = require('../models/Order');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const Setting = require('../models/Setting');

const migrateOrders = async () => {
    console.log('🔄 Starting order seller migration...\n');

    // Get platform settings for default commission
    const settings = await Setting.findOne();
    const defaultCommission = settings?.commissionRate || 10;

    // Find orders without seller attribution
    const ordersToMigrate = await Order.find({
        'orderItems.seller': { $exists: false }
    });

    console.log(`Found ${ordersToMigrate.length} orders to migrate\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const order of ordersToMigrate) {
        try {
            let modified = false;

            for (const item of order.orderItems) {
                // Skip if already has seller
                if (item.seller) continue;

                // Get product to find seller
                const product = await Product.findById(item.product);

                if (product && product.seller) {
                    // Get seller for commission rate
                    const seller = await Seller.findById(product.seller);
                    const commissionRate = seller?.commissionPercentage || defaultCommission;

                    // Calculate commission
                    const itemTotal = item.price * item.qty;
                    const platformCommission = (itemTotal * commissionRate) / 100;
                    const sellerShare = itemTotal - platformCommission;

                    // Update item
                    item.seller = product.seller;
                    item.itemTotal = itemTotal;
                    item.sellerShare = sellerShare;
                    item.platformCommission = platformCommission;
                    item.commissionRate = commissionRate;
                    item.settlementStatus = order.isDelivered ? 'ELIGIBLE' :
                        order.isPaid ? 'PENDING' : 'PENDING';

                    modified = true;
                }
            }

            if (modified) {
                await order.save();
                successCount++;
                console.log(`✅ Migrated order ${order._id} (${order.invoiceNumber || 'no invoice'})`);
            }

        } catch (error) {
            errorCount++;
            console.error(`❌ Failed to migrate order ${order._id}:`, error.message);
        }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successfully migrated: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log(`   📦 Total processed: ${ordersToMigrate.length}`);
};

const createMissingLedgerEntries = async () => {
    console.log('\n🔄 Creating missing ledger entries for paid orders...\n');

    const SellerLedger = require('../models/SellerLedger');

    // Find paid orders that might not have ledger entries
    const paidOrders = await Order.find({
        isPaid: true,
        'orderItems.seller': { $exists: true },
        'orderItems.ledgerEntryId': { $exists: false }
    }).limit(100); // Process in batches

    console.log(`Found ${paidOrders.length} paid orders without ledger entries\n`);

    let createdCount = 0;

    for (const order of paidOrders) {
        for (const item of order.orderItems) {
            if (!item.seller || item.ledgerEntryId) continue;

            try {
                // Check if ledger entry already exists
                const existing = await SellerLedger.findOne({
                    order: order._id,
                    'orderItem.productId': item.product
                });

                if (existing) {
                    item.ledgerEntryId = existing._id;
                    continue;
                }

                // Create ledger entry
                const holdUntil = order.isDelivered
                    ? new Date(order.deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000)
                    : null;

                const balance = await SellerLedger.getSellerBalance(item.seller);

                const entry = await SellerLedger.create({
                    seller: item.seller,
                    type: 'ORDER_CREDIT',
                    grossAmount: item.itemTotal || (item.price * item.qty),
                    commission: item.platformCommission || 0,
                    commissionRate: item.commissionRate || 10,
                    netAmount: item.sellerShare || (item.price * item.qty * 0.9),
                    runningBalance: balance.currentBalance + (item.sellerShare || (item.price * item.qty * 0.9)),
                    order: order._id,
                    orderItem: {
                        productId: item.product,
                        productName: item.name,
                        quantity: item.qty,
                        unitPrice: item.price
                    },
                    status: order.isDelivered ? 'ON_HOLD' : 'PENDING',
                    holdUntil,
                    description: `Order ${order.invoiceNumber || order._id}: ${item.name}`,
                    metadata: {
                        invoiceNumber: order.invoiceNumber,
                        paymentMethod: order.paymentMethod
                    }
                });

                item.ledgerEntryId = entry._id;
                createdCount++;
                console.log(`  ✅ Created ledger entry for ${item.name} in order ${order.invoiceNumber || order._id}`);

            } catch (error) {
                console.error(`  ❌ Failed to create ledger for ${item.name}:`, error.message);
            }
        }

        await order.save();
    }

    console.log(`\n📊 Created ${createdCount} ledger entries`);
};

const run = async () => {
    try {
        await connectDB();
        console.log('Connected to database\n');

        await migrateOrders();
        await createMissingLedgerEntries();

        console.log('\n✅ Migration complete!');
        process.exit(0);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

run();
