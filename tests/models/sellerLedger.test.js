/**
 * SellerLedger Model Tests
 * Tests for the seller ledger financial tracking system
 */

const mongoose = require('mongoose');
const SellerLedger = require('../../models/SellerLedger');
const Seller = require('../../models/Seller');
const User = require('../../models/User');
const { mockUsers, mockSeller, mockLedgerEntries } = require('../fixtures/financialFixtures');

describe('SellerLedger Model', () => {
    let seller;
    let user;

    beforeEach(async () => {
        // Create test user and seller
        user = await User.create({
            name: 'Test Seller',
            email: 'seller@ledgertest.com',
            password: 'password123',
            role: 'seller'
        });

        seller = await Seller.create({
            user: user._id,
            businessName: 'Test Business',
            ownerName: 'Test Owner',
            email: 'seller@ledgertest.com',
            phone: '9876543210',
            gstNumber: 'GST123456789',
            status: 'APPROVED',
            bankDetails: {
                accountHolderName: 'Test Owner',
                accountNumber: '1234567890',
                ifscCode: 'TEST0001234',
                bankName: 'Test Bank'
            }
        });
    });

    describe('Schema Validation', () => {
        it('should create a valid ledger entry with all required fields', async () => {
            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'ORDER_CREDIT',
                grossAmount: 1000,
                commission: 100,
                commissionRate: 10,
                netAmount: 900,
                runningBalance: 900,
                description: 'Test order credit',
                status: 'PENDING'
            });

            expect(entry).toBeDefined();
            expect(entry.seller.toString()).toBe(seller._id.toString());
            expect(entry.type).toBe('ORDER_CREDIT');
            expect(entry.grossAmount).toBe(1000);
            expect(entry.netAmount).toBe(900);
            expect(entry.status).toBe('PENDING');
        });

        it('should reject invalid entry type', async () => {
            const invalidEntry = {
                seller: seller._id,
                type: 'INVALID_TYPE',
                grossAmount: 1000,
                netAmount: 900,
                description: 'Invalid entry'
            };

            await expect(SellerLedger.create(invalidEntry)).rejects.toThrow();
        });

        it('should reject entry without seller', async () => {
            const entryWithoutSeller = {
                type: 'ORDER_CREDIT',
                grossAmount: 1000,
                netAmount: 900,
                description: 'Missing seller'
            };

            await expect(SellerLedger.create(entryWithoutSeller)).rejects.toThrow();
        });

        it('should set default status to PENDING', async () => {
            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'ORDER_CREDIT',
                grossAmount: 500,
                netAmount: 450,
                description: 'Default status test'
            });

            expect(entry.status).toBe('PENDING');
        });
    });

    describe('Entry Types', () => {
        it('should accept ORDER_CREDIT type', async () => {
            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'ORDER_CREDIT',
                grossAmount: 1000,
                netAmount: 900,
                description: 'Order payment credit'
            });

            expect(entry.type).toBe('ORDER_CREDIT');
        });

        it('should accept RETURN_DEBIT type', async () => {
            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'RETURN_DEBIT',
                grossAmount: -500,
                netAmount: -450,
                description: 'Return debit'
            });

            expect(entry.type).toBe('RETURN_DEBIT');
        });

        it('should accept CANCELLATION_DEBIT type', async () => {
            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'CANCELLATION_DEBIT',
                grossAmount: -300,
                netAmount: -300,
                description: 'Order cancellation'
            });

            expect(entry.type).toBe('CANCELLATION_DEBIT');
        });

        it('should accept SETTLEMENT_DEBIT type', async () => {
            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'SETTLEMENT_DEBIT',
                grossAmount: -2000,
                netAmount: -2000,
                description: 'Settlement payout'
            });

            expect(entry.type).toBe('SETTLEMENT_DEBIT');
        });

        it('should accept ADJUSTMENT type', async () => {
            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'ADJUSTMENT',
                grossAmount: 100,
                netAmount: 100,
                description: 'Manual adjustment'
            });

            expect(entry.type).toBe('ADJUSTMENT');
        });
    });

    describe('Status Transitions', () => {
        it('should allow PENDING to ON_HOLD transition', async () => {
            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'ORDER_CREDIT',
                grossAmount: 1000,
                netAmount: 900,
                status: 'PENDING',
                description: 'Status test'
            });

            entry.status = 'ON_HOLD';
            entry.holdUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await entry.save();

            expect(entry.status).toBe('ON_HOLD');
        });

        it('should allow ON_HOLD to ELIGIBLE transition', async () => {
            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'ORDER_CREDIT',
                grossAmount: 1000,
                netAmount: 900,
                status: 'ON_HOLD',
                holdUntil: new Date(Date.now() - 1000), // Past hold date
                description: 'Status test'
            });

            entry.status = 'ELIGIBLE';
            await entry.save();

            expect(entry.status).toBe('ELIGIBLE');
        });

        it('should allow ELIGIBLE to SETTLED transition', async () => {
            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'ORDER_CREDIT',
                grossAmount: 1000,
                netAmount: 900,
                status: 'ELIGIBLE',
                description: 'Status test'
            });

            entry.status = 'SETTLED';
            await entry.save();

            expect(entry.status).toBe('SETTLED');
        });
    });

    describe('Balance Calculation - getSellerBalance', () => {
        beforeEach(async () => {
            // Create multiple ledger entries with different statuses
            await SellerLedger.create([
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 1000,
                    netAmount: 900,
                    status: 'ELIGIBLE',
                    description: 'Eligible entry 1'
                },
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 2000,
                    netAmount: 1800,
                    status: 'ELIGIBLE',
                    description: 'Eligible entry 2'
                },
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 500,
                    netAmount: 450,
                    status: 'ON_HOLD',
                    holdUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    description: 'On hold entry'
                },
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 300,
                    netAmount: 270,
                    status: 'PENDING',
                    description: 'Pending entry'
                },
                {
                    seller: seller._id,
                    type: 'RETURN_DEBIT',
                    grossAmount: -200,
                    netAmount: -180,
                    status: 'ELIGIBLE',
                    description: 'Return debit'
                }
            ]);
        });

        it('should calculate eligible balance correctly', async () => {
            const balance = await SellerLedger.getSellerBalance(seller._id);

            // Eligible: 900 + 1800 - 180 = 2520
            expect(balance.eligible).toBe(2520);
        });

        it('should calculate on-hold balance correctly', async () => {
            const balance = await SellerLedger.getSellerBalance(seller._id);

            // OnHold: 450
            expect(balance.onHold).toBe(450);
        });

        it('should calculate pending balance correctly', async () => {
            const balance = await SellerLedger.getSellerBalance(seller._id);

            // Pending: 270
            expect(balance.pending).toBe(270);
        });

        it('should return zero balances for seller with no entries', async () => {
            const newSeller = await Seller.create({
                user: user._id,
                businessName: 'Empty Seller',
                ownerName: 'No Balance',
                email: 'empty@test.com',
                phone: '1111111111',
                status: 'APPROVED'
            });

            const balance = await SellerLedger.getSellerBalance(newSeller._id);

            expect(balance.eligible).toBe(0);
            expect(balance.onHold).toBe(0);
            expect(balance.pending).toBe(0);
        });
    });

    describe('Eligible Entries - getEligibleEntries', () => {
        it('should return only ELIGIBLE status entries for settlement', async () => {
            await SellerLedger.create([
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 1000,
                    netAmount: 900,
                    status: 'ELIGIBLE',
                    description: 'Eligible 1'
                },
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 500,
                    netAmount: 450,
                    status: 'ELIGIBLE',
                    description: 'Eligible 2'
                },
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 300,
                    netAmount: 270,
                    status: 'ON_HOLD',
                    description: 'Not eligible'
                }
            ]);

            const eligibleEntries = await SellerLedger.getEligibleEntries(seller._id);

            expect(eligibleEntries).toHaveLength(2);
            expect(eligibleEntries.every(e => e.status === 'ELIGIBLE')).toBe(true);
        });

        it('should filter by date range when provided', async () => {
            const now = new Date();
            const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
            const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

            await SellerLedger.create([
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 1000,
                    netAmount: 900,
                    status: 'ELIGIBLE',
                    createdAt: now,
                    description: 'Recent'
                },
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 500,
                    netAmount: 450,
                    status: 'ELIGIBLE',
                    createdAt: twoWeeksAgo,
                    description: 'Old'
                }
            ]);

            const eligibleEntries = await SellerLedger.getEligibleEntries(
                seller._id,
                oneWeekAgo,
                now
            );

            expect(eligibleEntries).toHaveLength(1);
            expect(eligibleEntries[0].description).toBe('Recent');
        });
    });

    describe('Commission Calculation', () => {
        it('should correctly calculate commission based on rate', async () => {
            const commissionRate = 10;
            const grossAmount = 1000;
            const expectedCommission = 100;

            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'ORDER_CREDIT',
                grossAmount: grossAmount,
                commission: expectedCommission,
                commissionRate: commissionRate,
                netAmount: grossAmount - expectedCommission,
                description: 'Commission test'
            });

            expect(entry.commission).toBe(expectedCommission);
            expect(entry.commissionRate).toBe(commissionRate);
        });

        it('should include GST on commission', async () => {
            const grossAmount = 1000;
            const commission = 100;
            const gst = 18; // 18% GST on commission
            const expectedNet = grossAmount - commission - gst;

            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'ORDER_CREDIT',
                grossAmount: grossAmount,
                commission: commission,
                gst: gst,
                netAmount: expectedNet,
                description: 'GST test'
            });

            expect(entry.gst).toBe(18);
            expect(entry.netAmount).toBe(882);
        });

        it('should include TDS on earnings', async () => {
            const grossAmount = 1000;
            const commission = 100;
            const gst = 18;
            const tds = 10; // 1% TDS
            const expectedNet = grossAmount - commission - gst - tds;

            const entry = await SellerLedger.create({
                seller: seller._id,
                type: 'ORDER_CREDIT',
                grossAmount: grossAmount,
                commission: commission,
                gst: gst,
                tds: tds,
                netAmount: expectedNet,
                description: 'TDS test'
            });

            expect(entry.tds).toBe(10);
            expect(entry.netAmount).toBe(872);
        });
    });
});
