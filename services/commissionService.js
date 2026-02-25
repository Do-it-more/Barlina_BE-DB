/**
 * Commission Service
 * Handles all commission calculation and ledger entry creation
 * This is the core financial engine for the marketplace
 */

const SellerLedger = require('../models/SellerLedger');
const Seller = require('../models/Seller');
const Product = require('../models/Product');
const Setting = require('../models/Setting');

/**
 * Calculate commission for an order item
 * @param {Object} item - The order item
 * @param {Object} seller - The seller object (optional, will be fetched if not provided)
 * @param {Object} settings - Platform settings (optional)
 * @returns {Object} Commission breakdown
 */
const calculateItemCommission = async (item, seller = null, settings = null) => {
    // Get seller if not provided
    if (!seller && item.seller) {
        seller = await Seller.findById(item.seller);
    }

    // Get platform settings if not provided
    if (!settings) {
        settings = await Setting.findOne();
    }

    const itemTotal = item.price * item.qty;
    const commissionRate = seller?.commissionPercentage || 10; // Default 10%
    const platformCommission = (itemTotal * commissionRate) / 100;
    const sellerShare = itemTotal - platformCommission;

    // Calculate GST on commission (if applicable)
    const gstRate = settings?.gstRate || 18;
    const gstOnCommission = (platformCommission * gstRate) / 100;

    return {
        itemTotal,
        commissionRate,
        platformCommission,
        sellerShare,
        gstOnCommission,
        netSellerShare: sellerShare // After all deductions
    };
};

/**
 * Create ledger entries for a paid order
 * Called after payment is confirmed
 * @param {Object} order - The order object with populated items
 * @param {Object} createdBy - User who triggered this (usually system)
 */
const createOrderLedgerEntries = async (order, createdBy = null) => {
    const settings = await Setting.findOne();
    const holdDays = 7; // Default hold period after delivery
    const ledgerEntries = [];

    // Group items by seller
    const sellerItems = {};

    for (const item of order.orderItems) {
        if (!item.seller) {
            // Platform product - no seller attribution needed
            continue;
        }

        const sellerId = item.seller.toString();
        if (!sellerItems[sellerId]) {
            sellerItems[sellerId] = {
                sellerId,
                seller: await Seller.findById(sellerId),
                items: []
            };
        }
        sellerItems[sellerId].items.push(item);
    }

    // Create ledger entry for each seller
    for (const sellerId in sellerItems) {
        const { seller, items } = sellerItems[sellerId];
        if (!seller) continue;

        // Get current balance
        const balance = await SellerLedger.getSellerBalance(sellerId);

        for (const item of items) {
            const commission = await calculateItemCommission(item, seller, settings);

            // Create ledger entry
            const entry = await SellerLedger.create({
                seller: sellerId,
                type: 'ORDER_CREDIT',
                grossAmount: commission.itemTotal,
                commission: commission.platformCommission,
                commissionRate: commission.commissionRate,
                taxAmount: commission.gstOnCommission,
                netAmount: commission.sellerShare,
                runningBalance: balance.currentBalance + commission.sellerShare,
                order: order._id,
                orderItem: {
                    productId: item.product,
                    productName: item.name,
                    quantity: item.qty,
                    unitPrice: item.price
                },
                status: 'PENDING', // Will become ON_HOLD after delivery
                description: `Order ${order.invoiceNumber || order._id}: ${item.name} x ${item.qty}`,
                createdBy,
                metadata: {
                    invoiceNumber: order.invoiceNumber,
                    paymentMethod: order.paymentMethod
                }
            });

            ledgerEntries.push(entry);

            // Update order item with ledger entry reference
            item.ledgerEntryId = entry._id;
            item.itemTotal = commission.itemTotal;
            item.sellerShare = commission.sellerShare;
            item.platformCommission = commission.platformCommission;
            item.commissionRate = commission.commissionRate;
        }
    }

    // Save order with updated item references
    await order.save();

    return ledgerEntries;
};

/**
 * Mark ledger entries as ON_HOLD after delivery
 * Called when order is marked as delivered
 * @param {Object} order - The delivered order
 * @param {Number} holdDays - Number of days to hold (default: 7)
 */
const markEntriesOnHold = async (order, holdDays = 7) => {
    const holdUntil = new Date();
    holdUntil.setDate(holdUntil.getDate() + holdDays);

    for (const item of order.orderItems) {
        if (item.ledgerEntryId) {
            await SellerLedger.findByIdAndUpdate(item.ledgerEntryId, {
                status: 'ON_HOLD',
                holdUntil
            });

            // Update order item settlement status
            item.settlementStatus = 'ON_HOLD';
        }
    }

    await order.save();
};

/**
 * Create return debit entry in ledger
 * Called when return is approved and refunded
 * @param {Object} returnRequest - The return request
 * @param {Object} order - The original order
 * @param {Object} createdBy - User who processed the return
 */
const createReturnDebitEntry = async (returnRequest, order, createdBy) => {
    const item = returnRequest.orderItem;
    if (!order.orderItems) {
        order = await order.populate('orderItems');
    }

    // Find the original order item
    const originalItem = order.orderItems.find(
        i => i.product.toString() === item.product.toString()
    );

    if (!originalItem || !originalItem.seller) {
        return null; // Platform product, no seller debit needed
    }

    const sellerId = originalItem.seller;
    const balance = await SellerLedger.getSellerBalance(sellerId);

    // Create debit entry
    const entry = await SellerLedger.create({
        seller: sellerId,
        type: 'RETURN_DEBIT',
        grossAmount: returnRequest.refundAmount,
        netAmount: returnRequest.refundAmount,
        runningBalance: balance.currentBalance - returnRequest.refundAmount,
        order: order._id,
        returnRequest: returnRequest._id,
        orderItem: {
            productId: item.product,
            productName: item.name,
            quantity: item.qty,
            unitPrice: item.price
        },
        status: 'ELIGIBLE', // Immediately affects balance
        description: `Return refund: ${item.name} - Order ${order.invoiceNumber || order._id}`,
        createdBy
    });

    // Update original ledger entry if exists
    if (originalItem.ledgerEntryId) {
        await SellerLedger.findByIdAndUpdate(originalItem.ledgerEntryId, {
            status: 'CANCELLED'
        });
    }

    return entry;
};

/**
 * Create cancellation debit entry in ledger
 * Called when order is cancelled after payment
 * @param {Object} order - The cancelled order
 * @param {Object} createdBy - User who cancelled the order
 */
const createCancellationDebitEntry = async (order, createdBy) => {
    const entries = [];

    for (const item of order.orderItems) {
        if (!item.seller) continue;

        const sellerId = item.seller;
        const balance = await SellerLedger.getSellerBalance(sellerId);
        const amount = item.sellerShare || (item.price * item.qty * 0.9); // Fallback calculation

        const entry = await SellerLedger.create({
            seller: sellerId,
            type: 'CANCELLATION_DEBIT',
            grossAmount: item.itemTotal || (item.price * item.qty),
            netAmount: amount,
            runningBalance: balance.currentBalance - amount,
            order: order._id,
            orderItem: {
                productId: item.product,
                productName: item.name,
                quantity: item.qty,
                unitPrice: item.price
            },
            status: 'ELIGIBLE',
            description: `Order cancelled: ${item.name} - Order ${order.invoiceNumber || order._id}`,
            createdBy
        });

        entries.push(entry);

        // Cancel original ledger entry
        if (item.ledgerEntryId) {
            await SellerLedger.findByIdAndUpdate(item.ledgerEntryId, {
                status: 'CANCELLED'
            });
        }
    }

    return entries;
};

/**
 * Populate seller info in order items before saving
 * Called during order creation
 * @param {Array} orderItems - Array of order items
 * @returns {Array} Order items with seller info populated
 */
const populateSellerInfo = async (orderItems) => {
    const populatedItems = [];

    for (const item of orderItems) {
        const product = await Product.findById(item.product).populate('seller');

        const populatedItem = {
            ...item,
            seller: product?.seller?._id || null
        };

        if (product?.seller) {
            const commission = await calculateItemCommission({
                price: item.price,
                qty: item.qty,
                seller: product.seller._id
            }, product.seller);

            populatedItem.itemTotal = commission.itemTotal;
            populatedItem.sellerShare = commission.sellerShare;
            populatedItem.platformCommission = commission.platformCommission;
            populatedItem.commissionRate = commission.commissionRate;
            populatedItem.settlementStatus = 'PENDING';
        }

        populatedItems.push(populatedItem);
    }

    return populatedItems;
};

module.exports = {
    calculateItemCommission,
    createOrderLedgerEntries,
    markEntriesOnHold,
    createReturnDebitEntry,
    createCancellationDebitEntry,
    populateSellerInfo
};
