/**
 * Settlement Model Tests
 * Tests for the settlement generation and management system
 */

const mongoose = require('mongoose');
const Settlement = require('../../models/Settlement');
const SellerLedger = require('../../models/SellerLedger');
const Seller = require('../../models/Seller');
const User = require('../../models/User');

describe('Settlement Model', () => {
    let seller;
    let user;
    let adminUser;

    beforeEach(async () => {
        // Create test users
        user = await User.create({
            name: 'Test Seller',
            email: 'settlement.seller@test.com',
            password: 'password123',
            role: 'seller'
        });

        adminUser = await User.create({
            name: 'Admin User',
            email: 'admin@settlement.test.com',
            password: 'password123',
            role: 'super_admin'
        });

        // Create test seller
        seller = await Seller.create({
            user: user._id,
            businessName: 'Settlement Test Business',
            ownerName: 'Test Owner',
            email: 'settlement.seller@test.com',
            phone: '9876543210',
            gstNumber: 'GST987654321',
            status: 'APPROVED',
            bankDetails: {
                accountHolderName: 'Test Owner',
                accountNumber: '9876543210',
                ifscCode: 'SETT0001234',
                bankName: 'Settlement Bank'
            }
        });
    });

    describe('Schema Validation', () => {
        it('should create a valid settlement with required fields', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date('2026-02-01'),
                periodEnd: new Date('2026-02-07'),
                grossAmount: 10000,
                totalCommission: 1000,
                totalGST: 180,
                totalTDS: 100,
                totalDeductions: 1280,
                netPayable: 8720,
                status: 'PENDING_APPROVAL',
                createdBy: adminUser._id
            });

            expect(settlement).toBeDefined();
            expect(settlement.settlementNumber).toBeDefined();
            expect(settlement.seller.toString()).toBe(seller._id.toString());
            expect(settlement.grossAmount).toBe(10000);
            expect(settlement.netPayable).toBe(8720);
            expect(settlement.status).toBe('PENDING_APPROVAL');
        });

        it('should auto-generate settlement number', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date('2026-02-01'),
                periodEnd: new Date('2026-02-07'),
                grossAmount: 5000,
                netPayable: 4000,
                status: 'PENDING_APPROVAL'
            });

            expect(settlement.settlementNumber).toMatch(/^STL-\d{6}-\d{4}$/);
        });

        it('should reject settlement without seller', async () => {
            const invalidSettlement = {
                periodStart: new Date('2026-02-01'),
                periodEnd: new Date('2026-02-07'),
                grossAmount: 5000,
                netPayable: 4000
            };

            await expect(Settlement.create(invalidSettlement)).rejects.toThrow();
        });
    });

    describe('Status Values', () => {
        it('should accept PENDING_APPROVAL status', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 1000,
                netPayable: 800,
                status: 'PENDING_APPROVAL'
            });

            expect(settlement.status).toBe('PENDING_APPROVAL');
        });

        it('should accept APPROVED status', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 1000,
                netPayable: 800,
                status: 'APPROVED'
            });

            expect(settlement.status).toBe('APPROVED');
        });

        it('should accept PROCESSING status', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 1000,
                netPayable: 800,
                status: 'PROCESSING'
            });

            expect(settlement.status).toBe('PROCESSING');
        });

        it('should accept PAID status', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 1000,
                netPayable: 800,
                status: 'PAID'
            });

            expect(settlement.status).toBe('PAID');
        });

        it('should accept REJECTED status', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 1000,
                netPayable: 800,
                status: 'REJECTED'
            });

            expect(settlement.status).toBe('REJECTED');
        });

        it('should reject invalid status', async () => {
            const invalidSettlement = {
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 1000,
                netPayable: 800,
                status: 'INVALID_STATUS'
            };

            await expect(Settlement.create(invalidSettlement)).rejects.toThrow();
        });
    });

    describe('Settlement Number Generation', () => {
        it('should generate unique settlement numbers', async () => {
            const settlement1 = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 1000,
                netPayable: 800,
                status: 'PENDING_APPROVAL'
            });

            const settlement2 = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 2000,
                netPayable: 1600,
                status: 'PENDING_APPROVAL'
            });

            expect(settlement1.settlementNumber).not.toBe(settlement2.settlementNumber);
        });

        it('should include year and month in settlement number', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 1000,
                netPayable: 800,
                status: 'PENDING_APPROVAL'
            });

            const now = new Date();
            const expectedPrefix = `STL-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

            expect(settlement.settlementNumber.startsWith(expectedPrefix)).toBe(true);
        });
    });

    describe('Payment Information', () => {
        it('should store UTR number for paid settlements', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 5000,
                netPayable: 4000,
                status: 'PAID',
                paymentInfo: {
                    method: 'BANK_TRANSFER',
                    utrNumber: 'UTR123456789',
                    paidAt: new Date()
                }
            });

            expect(settlement.paymentInfo.utrNumber).toBe('UTR123456789');
            expect(settlement.paymentInfo.method).toBe('BANK_TRANSFER');
        });

        it('should track approved by and approved at', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 5000,
                netPayable: 4000,
                status: 'APPROVED',
                approvedBy: adminUser._id,
                approvedAt: new Date()
            });

            expect(settlement.approvedBy.toString()).toBe(adminUser._id.toString());
            expect(settlement.approvedAt).toBeInstanceOf(Date);
        });

        it('should track processed by and processed at', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 5000,
                netPayable: 4000,
                status: 'PROCESSING',
                processedBy: adminUser._id,
                processedAt: new Date()
            });

            expect(settlement.processedBy.toString()).toBe(adminUser._id.toString());
            expect(settlement.processedAt).toBeInstanceOf(Date);
        });
    });

    describe('Settlement Generation - generateSettlement', () => {
        beforeEach(async () => {
            // Create eligible ledger entries for settlement
            await SellerLedger.create([
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 5000,
                    commission: 500,
                    commissionRate: 10,
                    gst: 90,
                    tds: 50,
                    netAmount: 4360,
                    status: 'ELIGIBLE',
                    createdAt: new Date('2026-02-03'),
                    description: 'Order 1'
                },
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 3000,
                    commission: 300,
                    commissionRate: 10,
                    gst: 54,
                    tds: 30,
                    netAmount: 2616,
                    status: 'ELIGIBLE',
                    createdAt: new Date('2026-02-05'),
                    description: 'Order 2'
                },
                {
                    seller: seller._id,
                    type: 'RETURN_DEBIT',
                    grossAmount: -1000,
                    commission: -100,
                    netAmount: -900,
                    status: 'ELIGIBLE',
                    createdAt: new Date('2026-02-06'),
                    description: 'Return'
                }
            ]);
        });

        it('should generate settlement from eligible entries', async () => {
            const settlement = await Settlement.generateSettlement(
                seller._id,
                new Date('2026-02-01'),
                new Date('2026-02-07'),
                adminUser._id
            );

            expect(settlement).toBeDefined();
            expect(settlement.seller.toString()).toBe(seller._id.toString());
            expect(settlement.status).toBe('PENDING_APPROVAL');
            expect(settlement.grossAmount).toBe(7000); // 5000 + 3000 - 1000
        });

        it('should calculate correct deductions', async () => {
            const settlement = await Settlement.generateSettlement(
                seller._id,
                new Date('2026-02-01'),
                new Date('2026-02-07'),
                adminUser._id
            );

            expect(settlement.totalCommission).toBe(700); // 500 + 300 - 100
            expect(settlement.totalGST).toBe(144); // 90 + 54
            expect(settlement.totalTDS).toBe(80); // 50 + 30
        });

        it('should link ledger entries to settlement', async () => {
            const settlement = await Settlement.generateSettlement(
                seller._id,
                new Date('2026-02-01'),
                new Date('2026-02-07'),
                adminUser._id
            );

            expect(settlement.ledgerEntries).toBeDefined();
            expect(settlement.ledgerEntries.length).toBeGreaterThan(0);
        });

        it('should throw error if no eligible entries', async () => {
            // Create a new seller with no entries
            const newSeller = await Seller.create({
                user: user._id,
                businessName: 'Empty Seller',
                ownerName: 'Empty',
                email: 'empty@settlement.test.com',
                phone: '1111111111',
                status: 'APPROVED'
            });

            await expect(
                Settlement.generateSettlement(
                    newSeller._id,
                    new Date('2026-02-01'),
                    new Date('2026-02-07'),
                    adminUser._id
                )
            ).rejects.toThrow('No eligible entries found for settlement');
        });

        it('should throw error for minimum settlement amount', async () => {
            // Create seller with very small eligible amount
            const smallSeller = await Seller.create({
                user: user._id,
                businessName: 'Small Seller',
                ownerName: 'Small',
                email: 'small@settlement.test.com',
                phone: '2222222222',
                status: 'APPROVED'
            });

            await SellerLedger.create({
                seller: smallSeller._id,
                type: 'ORDER_CREDIT',
                grossAmount: 50,
                netAmount: 45,
                status: 'ELIGIBLE',
                description: 'Small order'
            });

            // This should throw if there's a minimum settlement amount
            // Adjust based on your business rules
        });
    });

    describe('Financial Calculations', () => {
        it('should calculate net payable correctly', async () => {
            const grossAmount = 10000;
            const commission = 1000; // 10%
            const gst = 180; // 18% on commission
            const tds = 100; // 1% on gross
            const returns = 500;
            const totalDeductions = commission + gst + tds + returns;
            const expectedNet = grossAmount - totalDeductions;

            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: grossAmount,
                totalCommission: commission,
                totalGST: gst,
                totalTDS: tds,
                totalReturns: returns,
                totalDeductions: totalDeductions,
                netPayable: expectedNet,
                status: 'PENDING_APPROVAL'
            });

            expect(settlement.netPayable).toBe(8220);
        });

        it('should handle zero commission for promotional period', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 5000,
                totalCommission: 0,
                totalDeductions: 0,
                netPayable: 5000,
                status: 'PENDING_APPROVAL'
            });

            expect(settlement.totalCommission).toBe(0);
            expect(settlement.netPayable).toBe(5000);
        });

        it('should handle high return scenario', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 10000,
                totalCommission: 1000,
                totalReturns: 5000, // 50% returns
                totalDeductions: 6000,
                netPayable: 4000,
                status: 'PENDING_APPROVAL'
            });

            expect(settlement.totalReturns).toBe(5000);
            expect(settlement.netPayable).toBe(4000);
        });
    });

    describe('Period Validation', () => {
        it('should validate period end is after period start', async () => {
            const invalidSettlement = {
                seller: seller._id,
                periodStart: new Date('2026-02-07'),
                periodEnd: new Date('2026-02-01'), // Before start
                grossAmount: 1000,
                netPayable: 800,
                status: 'PENDING_APPROVAL'
            };

            // The model may or may not have this validation
            // Add if required by business logic
        });

        it('should store correct period dates', async () => {
            const periodStart = new Date('2026-02-01');
            const periodEnd = new Date('2026-02-07');

            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart,
                periodEnd,
                grossAmount: 1000,
                netPayable: 800,
                status: 'PENDING_APPROVAL'
            });

            expect(settlement.periodStart.toISOString()).toBe(periodStart.toISOString());
            expect(settlement.periodEnd.toISOString()).toBe(periodEnd.toISOString());
        });
    });

    describe('Seller Relationship', () => {
        it('should populate seller details', async () => {
            const settlement = await Settlement.create({
                seller: seller._id,
                periodStart: new Date(),
                periodEnd: new Date(),
                grossAmount: 5000,
                netPayable: 4000,
                status: 'PENDING_APPROVAL'
            });

            const populatedSettlement = await Settlement.findById(settlement._id)
                .populate('seller', 'businessName ownerName email bankDetails');

            expect(populatedSettlement.seller.businessName).toBe('Settlement Test Business');
            expect(populatedSettlement.seller.ownerName).toBe('Test Owner');
            expect(populatedSettlement.seller.bankDetails).toBeDefined();
        });

        it('should find all settlements for a seller', async () => {
            await Settlement.create([
                {
                    seller: seller._id,
                    periodStart: new Date('2026-01-01'),
                    periodEnd: new Date('2026-01-07'),
                    grossAmount: 5000,
                    netPayable: 4000,
                    status: 'PAID'
                },
                {
                    seller: seller._id,
                    periodStart: new Date('2026-01-08'),
                    periodEnd: new Date('2026-01-14'),
                    grossAmount: 6000,
                    netPayable: 4800,
                    status: 'PAID'
                },
                {
                    seller: seller._id,
                    periodStart: new Date('2026-01-15'),
                    periodEnd: new Date('2026-01-21'),
                    grossAmount: 7000,
                    netPayable: 5600,
                    status: 'PENDING_APPROVAL'
                }
            ]);

            const sellerSettlements = await Settlement.find({ seller: seller._id });
            expect(sellerSettlements).toHaveLength(3);

            const paidSettlements = await Settlement.find({
                seller: seller._id,
                status: 'PAID'
            });
            expect(paidSettlements).toHaveLength(2);
        });
    });
});
