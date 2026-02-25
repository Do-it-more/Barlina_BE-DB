/**
 * Settlement Controller API Tests
 * Integration tests for settlement API endpoints
 */

const mongoose = require('mongoose');
const Settlement = require('../../models/Settlement');
const SellerLedger = require('../../models/SellerLedger');
const Seller = require('../../models/Seller');
const User = require('../../models/User');
const { generateTestToken } = require('../fixtures/financialFixtures');

// Mock the asyncHandler
jest.mock('express-async-handler', () => fn => fn);

// Import controller functions
const {
    getSellerFinancialDashboard,
    getSellerLedger,
    getSellerSettlements,
    getPendingSettlements,
    getAllSettlements,
    getSettlementStats,
    generateSettlement,
    approveSettlement,
    rejectSettlement,
    processSettlement,
    markSettlementPaid
} = require('../../controllers/settlementController');

describe('Settlement Controller', () => {
    let seller, sellerUser, adminUser, financeUser;
    let mockReq, mockRes;

    beforeEach(async () => {
        // Create test users
        sellerUser = await User.create({
            name: 'Seller Test',
            email: 'seller.controller@test.com',
            password: 'password123',
            role: 'seller'
        });

        adminUser = await User.create({
            name: 'Admin Test',
            email: 'admin.controller@test.com',
            password: 'password123',
            role: 'super_admin'
        });

        financeUser = await User.create({
            name: 'Finance Test',
            email: 'finance.controller@test.com',
            password: 'password123',
            role: 'finance'
        });

        // Create seller
        seller = await Seller.create({
            user: sellerUser._id,
            businessName: 'Controller Test Business',
            ownerName: 'Controller Owner',
            email: 'seller.controller@test.com',
            phone: '9876543210',
            gstNumber: 'GST111111111',
            status: 'APPROVED',
            bankDetails: {
                accountHolderName: 'Controller Owner',
                accountNumber: '1234567890',
                ifscCode: 'CTRL0001234',
                bankName: 'Controller Bank'
            }
        });

        // Create mock response
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis()
        };
    });

    describe('Seller Endpoints', () => {
        describe('GET /api/settlements/dashboard - getSellerFinancialDashboard', () => {
            beforeEach(async () => {
                // Create ledger entries
                await SellerLedger.create([
                    {
                        seller: seller._id,
                        type: 'ORDER_CREDIT',
                        grossAmount: 5000,
                        commission: 500,
                        netAmount: 4500,
                        status: 'ELIGIBLE',
                        description: 'Order 1'
                    },
                    {
                        seller: seller._id,
                        type: 'ORDER_CREDIT',
                        grossAmount: 3000,
                        commission: 300,
                        netAmount: 2700,
                        status: 'ON_HOLD',
                        holdUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        description: 'Order 2'
                    }
                ]);

                // Create settlements
                await Settlement.create([
                    {
                        seller: seller._id,
                        periodStart: new Date('2026-01-01'),
                        periodEnd: new Date('2026-01-07'),
                        grossAmount: 10000,
                        netPayable: 8000,
                        status: 'PAID',
                        paymentInfo: { utrNumber: 'UTR123' }
                    }
                ]);
            });

            it('should return financial dashboard for seller', async () => {
                mockReq = {
                    user: sellerUser,
                    params: {},
                    query: {}
                };

                await getSellerFinancialDashboard(mockReq, mockRes);

                expect(mockRes.json).toHaveBeenCalled();
                const response = mockRes.json.mock.calls[0][0];

                expect(response.balance).toBeDefined();
                expect(response.recentTransactions).toBeDefined();
                expect(response.pendingSettlements).toBeDefined();
                expect(response.pastSettlements).toBeDefined();
                expect(response.stats).toBeDefined();
                expect(response.bankDetails).toBeDefined();
            });

            it('should return correct balance breakdown', async () => {
                mockReq = {
                    user: sellerUser,
                    params: {},
                    query: {}
                };

                await getSellerFinancialDashboard(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];

                expect(response.balance.eligible).toBe(4500);
                expect(response.balance.onHold).toBe(2700);
            });

            it('should return 404 if seller not found', async () => {
                const nonSellerUser = await User.create({
                    name: 'Non Seller',
                    email: 'nonseller@test.com',
                    password: 'password123',
                    role: 'user'
                });

                mockReq = {
                    user: nonSellerUser,
                    params: {},
                    query: {}
                };

                await expect(getSellerFinancialDashboard(mockReq, mockRes))
                    .rejects.toThrow('Seller profile not found');
            });
        });

        describe('GET /api/settlements/ledger - getSellerLedger', () => {
            beforeEach(async () => {
                // Create multiple ledger entries
                for (let i = 0; i < 25; i++) {
                    await SellerLedger.create({
                        seller: seller._id,
                        type: 'ORDER_CREDIT',
                        grossAmount: 1000 + i * 100,
                        netAmount: 900 + i * 90,
                        status: 'ELIGIBLE',
                        description: `Order ${i + 1}`
                    });
                }
            });

            it('should return paginated ledger entries', async () => {
                mockReq = {
                    user: sellerUser,
                    params: {},
                    query: { page: 1, limit: 10 }
                };

                await getSellerLedger(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];

                expect(response.transactions).toHaveLength(10);
                expect(response.pagination.page).toBe(1);
                expect(response.pagination.total).toBe(25);
                expect(response.pagination.pages).toBe(3);
            });

            it('should filter by type', async () => {
                await SellerLedger.create({
                    seller: seller._id,
                    type: 'RETURN_DEBIT',
                    grossAmount: -500,
                    netAmount: -450,
                    status: 'SETTLED',
                    description: 'Return'
                });

                mockReq = {
                    user: sellerUser,
                    params: {},
                    query: { type: 'RETURN_DEBIT', page: 1, limit: 10 }
                };

                await getSellerLedger(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.transactions.every(t => t.type === 'RETURN_DEBIT')).toBe(true);
            });

            it('should filter by status', async () => {
                mockReq = {
                    user: sellerUser,
                    params: {},
                    query: { status: 'ELIGIBLE', page: 1, limit: 50 }
                };

                await getSellerLedger(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.transactions.every(t => t.status === 'ELIGIBLE')).toBe(true);
            });

            it('should apply date range filter', async () => {
                const now = new Date();
                const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

                mockReq = {
                    user: sellerUser,
                    params: {},
                    query: {
                        startDate: startDate.toISOString(),
                        endDate: now.toISOString(),
                        page: 1,
                        limit: 50
                    }
                };

                await getSellerLedger(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.transactions).toBeDefined();
            });
        });

        describe('GET /api/settlements/history - getSellerSettlements', () => {
            beforeEach(async () => {
                await Settlement.create([
                    {
                        seller: seller._id,
                        periodStart: new Date('2026-01-01'),
                        periodEnd: new Date('2026-01-07'),
                        grossAmount: 10000,
                        netPayable: 8000,
                        status: 'PAID'
                    },
                    {
                        seller: seller._id,
                        periodStart: new Date('2026-01-08'),
                        periodEnd: new Date('2026-01-14'),
                        grossAmount: 15000,
                        netPayable: 12000,
                        status: 'PAID'
                    },
                    {
                        seller: seller._id,
                        periodStart: new Date('2026-01-15'),
                        periodEnd: new Date('2026-01-21'),
                        grossAmount: 8000,
                        netPayable: 6400,
                        status: 'PENDING_APPROVAL'
                    }
                ]);
            });

            it('should return settlement history', async () => {
                mockReq = {
                    user: sellerUser,
                    params: {},
                    query: {}
                };

                await getSellerSettlements(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.settlements).toHaveLength(3);
            });

            it('should filter by status', async () => {
                mockReq = {
                    user: sellerUser,
                    params: {},
                    query: { status: 'PAID' }
                };

                await getSellerSettlements(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.settlements.every(s => s.status === 'PAID')).toBe(true);
            });

            it('should paginate results', async () => {
                mockReq = {
                    user: sellerUser,
                    params: {},
                    query: { page: 1, limit: 2 }
                };

                await getSellerSettlements(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.settlements).toHaveLength(2);
                expect(response.pagination.total).toBe(3);
            });
        });
    });

    describe('Admin Endpoints', () => {
        describe('GET /api/settlements/admin/stats - getSettlementStats', () => {
            beforeEach(async () => {
                await Settlement.create([
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 5000, netPayable: 4000, status: 'PENDING_APPROVAL' },
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 6000, netPayable: 4800, status: 'PENDING_APPROVAL' },
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 7000, netPayable: 5600, status: 'APPROVED' },
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 8000, netPayable: 6400, status: 'PROCESSING' },
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 10000, netPayable: 8000, status: 'PAID' },
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 12000, netPayable: 9600, status: 'PAID' },
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 3000, netPayable: 2400, status: 'REJECTED' }
                ]);
            });

            it('should return correct stats by status', async () => {
                mockReq = { user: adminUser, params: {}, query: {} };

                await getSettlementStats(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];

                expect(response.pending).toBe(2);
                expect(response.approved).toBe(1);
                expect(response.processing).toBe(1);
                expect(response.completed).toBe(2);
                expect(response.failed).toBe(1);
                expect(response.totalPaid).toBe(17600); // 8000 + 9600
            });
        });

        describe('GET /api/settlements/admin - getAllSettlements', () => {
            beforeEach(async () => {
                // Create second seller
                const seller2User = await User.create({
                    name: 'Seller 2',
                    email: 'seller2@test.com',
                    password: 'password123',
                    role: 'seller'
                });

                const seller2 = await Seller.create({
                    user: seller2User._id,
                    businessName: 'Business 2',
                    ownerName: 'Owner 2',
                    email: 'seller2@test.com',
                    phone: '8888888888',
                    status: 'APPROVED'
                });

                await Settlement.create([
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 5000, netPayable: 4000, status: 'PENDING_APPROVAL' },
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 6000, netPayable: 4800, status: 'APPROVED' },
                    { seller: seller2._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 7000, netPayable: 5600, status: 'PENDING_APPROVAL' },
                    { seller: seller2._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 8000, netPayable: 6400, status: 'PAID' }
                ]);
            });

            it('should return all settlements', async () => {
                mockReq = { user: adminUser, params: {}, query: {} };

                await getAllSettlements(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.settlements).toHaveLength(4);
            });

            it('should filter by status', async () => {
                mockReq = {
                    user: adminUser,
                    params: {},
                    query: { status: 'PENDING_APPROVAL' }
                };

                await getAllSettlements(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.settlements.every(s => s.status === 'PENDING_APPROVAL')).toBe(true);
            });

            it('should filter by seller', async () => {
                mockReq = {
                    user: adminUser,
                    params: {},
                    query: { sellerId: seller._id.toString() }
                };

                await getAllSettlements(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.settlements).toHaveLength(2);
            });

            it('should return totals', async () => {
                mockReq = { user: adminUser, params: {}, query: {} };

                await getAllSettlements(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.totals).toBeDefined();
                expect(response.totals.totalGross).toBeDefined();
                expect(response.totals.totalPayable).toBeDefined();
            });
        });

        describe('GET /api/settlements/admin/pending - getPendingSettlements', () => {
            beforeEach(async () => {
                await Settlement.create([
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 5000, netPayable: 4000, status: 'PENDING_APPROVAL' },
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 6000, netPayable: 4800, status: 'APPROVED' },
                    { seller: seller._id, periodStart: new Date(), periodEnd: new Date(), grossAmount: 7000, netPayable: 5600, status: 'PAID' }
                ]);
            });

            it('should return only pending and approved settlements', async () => {
                mockReq = { user: adminUser, params: {}, query: {} };

                await getPendingSettlements(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response).toHaveLength(2);
                expect(response.every(s =>
                    s.status === 'PENDING_APPROVAL' || s.status === 'APPROVED'
                )).toBe(true);
            });
        });

        describe('POST /api/settlements/admin/generate - generateSettlement', () => {
            beforeEach(async () => {
                await SellerLedger.create([
                    {
                        seller: seller._id,
                        type: 'ORDER_CREDIT',
                        grossAmount: 5000,
                        commission: 500,
                        netAmount: 4500,
                        status: 'ELIGIBLE',
                        createdAt: new Date('2026-02-03'),
                        description: 'Order 1'
                    },
                    {
                        seller: seller._id,
                        type: 'ORDER_CREDIT',
                        grossAmount: 3000,
                        commission: 300,
                        netAmount: 2700,
                        status: 'ELIGIBLE',
                        createdAt: new Date('2026-02-05'),
                        description: 'Order 2'
                    }
                ]);
            });

            it('should generate settlement for seller', async () => {
                mockReq = {
                    user: adminUser,
                    params: {},
                    query: {},
                    body: {
                        sellerId: seller._id.toString(),
                        periodStart: '2026-02-01',
                        periodEnd: '2026-02-07'
                    }
                };

                await generateSettlement(mockReq, mockRes);

                expect(mockRes.status).toHaveBeenCalledWith(201);
                const response = mockRes.json.mock.calls[0][0];
                expect(response.seller.toString()).toBe(seller._id.toString());
                expect(response.status).toBe('PENDING_APPROVAL');
            });

            it('should return 400 for missing seller ID', async () => {
                mockReq = {
                    user: adminUser,
                    params: {},
                    query: {},
                    body: {
                        periodStart: '2026-02-01',
                        periodEnd: '2026-02-07'
                    }
                };

                await expect(generateSettlement(mockReq, mockRes))
                    .rejects.toThrow('Seller ID, period start, and period end are required');
            });
        });

        describe('PUT /api/settlements/admin/:id/approve - approveSettlement', () => {
            let pendingSettlement;

            beforeEach(async () => {
                pendingSettlement = await Settlement.create({
                    seller: seller._id,
                    periodStart: new Date(),
                    periodEnd: new Date(),
                    grossAmount: 10000,
                    netPayable: 8000,
                    status: 'PENDING_APPROVAL'
                });
            });

            it('should approve pending settlement', async () => {
                mockReq = {
                    user: adminUser,
                    params: { id: pendingSettlement._id.toString() },
                    body: { notes: 'Approved for payment' }
                };

                await approveSettlement(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.status).toBe('APPROVED');
                expect(response.approvedBy.toString()).toBe(adminUser._id.toString());
            });

            it('should return 404 for invalid settlement ID', async () => {
                mockReq = {
                    user: adminUser,
                    params: { id: new mongoose.Types.ObjectId().toString() },
                    body: {}
                };

                await expect(approveSettlement(mockReq, mockRes))
                    .rejects.toThrow('Settlement not found');
            });

            it('should return 400 for non-pending settlement', async () => {
                const approvedSettlement = await Settlement.create({
                    seller: seller._id,
                    periodStart: new Date(),
                    periodEnd: new Date(),
                    grossAmount: 5000,
                    netPayable: 4000,
                    status: 'APPROVED'
                });

                mockReq = {
                    user: adminUser,
                    params: { id: approvedSettlement._id.toString() },
                    body: {}
                };

                await expect(approveSettlement(mockReq, mockRes))
                    .rejects.toThrow('Settlement is not pending approval');
            });
        });

        describe('PUT /api/settlements/admin/:id/reject - rejectSettlement', () => {
            let pendingSettlement;

            beforeEach(async () => {
                pendingSettlement = await Settlement.create({
                    seller: seller._id,
                    periodStart: new Date(),
                    periodEnd: new Date(),
                    grossAmount: 10000,
                    netPayable: 8000,
                    status: 'PENDING_APPROVAL'
                });
            });

            it('should reject pending settlement', async () => {
                mockReq = {
                    user: adminUser,
                    params: { id: pendingSettlement._id.toString() },
                    body: { reason: 'Incorrect calculations' }
                };

                await rejectSettlement(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.status).toBe('REJECTED');
                expect(response.adminNotes).toBe('Incorrect calculations');
            });

            it('should not reject non-pending settlement', async () => {
                const approvedSettlement = await Settlement.create({
                    seller: seller._id,
                    periodStart: new Date(),
                    periodEnd: new Date(),
                    grossAmount: 5000,
                    netPayable: 4000,
                    status: 'APPROVED'
                });

                mockReq = {
                    user: adminUser,
                    params: { id: approvedSettlement._id.toString() },
                    body: { reason: 'Test' }
                };

                await expect(rejectSettlement(mockReq, mockRes))
                    .rejects.toThrow('Only pending settlements can be rejected');
            });
        });

        describe('PUT /api/settlements/admin/:id/process - processSettlement', () => {
            let approvedSettlement;

            beforeEach(async () => {
                approvedSettlement = await Settlement.create({
                    seller: seller._id,
                    periodStart: new Date(),
                    periodEnd: new Date(),
                    grossAmount: 10000,
                    netPayable: 8000,
                    status: 'APPROVED',
                    approvedBy: adminUser._id
                });
            });

            it('should process approved settlement', async () => {
                mockReq = {
                    user: financeUser,
                    params: { id: approvedSettlement._id.toString() },
                    body: {
                        utrNumber: 'UTR123456789',
                        notes: 'Processing payment'
                    }
                };

                await processSettlement(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.status).toBe('PROCESSING');
                expect(response.paymentInfo.utrNumber).toBe('UTR123456789');
            });

            it('should not process non-approved settlement', async () => {
                const pendingSettlement = await Settlement.create({
                    seller: seller._id,
                    periodStart: new Date(),
                    periodEnd: new Date(),
                    grossAmount: 5000,
                    netPayable: 4000,
                    status: 'PENDING_APPROVAL'
                });

                mockReq = {
                    user: financeUser,
                    params: { id: pendingSettlement._id.toString() },
                    body: { utrNumber: 'UTR123' }
                };

                await expect(processSettlement(mockReq, mockRes))
                    .rejects.toThrow('Settlement must be approved before processing');
            });
        });

        describe('PUT /api/settlements/admin/:id/paid - markSettlementPaid', () => {
            let processingSettlement;

            beforeEach(async () => {
                processingSettlement = await Settlement.create({
                    seller: seller._id,
                    periodStart: new Date(),
                    periodEnd: new Date(),
                    grossAmount: 10000,
                    netPayable: 8000,
                    status: 'PROCESSING',
                    processedBy: financeUser._id
                });
            });

            it('should mark settlement as paid', async () => {
                mockReq = {
                    user: financeUser,
                    params: { id: processingSettlement._id.toString() },
                    body: {
                        utrNumber: 'UTR987654321',
                        transactionId: 'TXN123456'
                    }
                };

                await markSettlementPaid(mockReq, mockRes);

                const response = mockRes.json.mock.calls[0][0];
                expect(response.status).toBe('PAID');
                expect(response.paymentInfo.utrNumber).toBe('UTR987654321');
                expect(response.paymentInfo.paidAt).toBeDefined();
            });

            it('should create PAYOUT ledger entry', async () => {
                mockReq = {
                    user: financeUser,
                    params: { id: processingSettlement._id.toString() },
                    body: { utrNumber: 'UTR111111111' }
                };

                await markSettlementPaid(mockReq, mockRes);

                const payoutEntry = await SellerLedger.findOne({
                    seller: seller._id,
                    type: 'PAYOUT'
                });

                expect(payoutEntry).toBeDefined();
                expect(payoutEntry.netAmount).toBe(8000);
            });

            it('should not mark pending settlement as paid', async () => {
                const pendingSettlement = await Settlement.create({
                    seller: seller._id,
                    periodStart: new Date(),
                    periodEnd: new Date(),
                    grossAmount: 5000,
                    netPayable: 4000,
                    status: 'PENDING_APPROVAL'
                });

                mockReq = {
                    user: financeUser,
                    params: { id: pendingSettlement._id.toString() },
                    body: { utrNumber: 'UTR123' }
                };

                await expect(markSettlementPaid(mockReq, mockRes))
                    .rejects.toThrow('Settlement must be approved or processing');
            });
        });
    });

    describe('Settlement Workflow Integration', () => {
        it('should complete full settlement workflow', async () => {
            // 1. Create eligible ledger entries
            await SellerLedger.create([
                {
                    seller: seller._id,
                    type: 'ORDER_CREDIT',
                    grossAmount: 10000,
                    commission: 1000,
                    netAmount: 9000,
                    status: 'ELIGIBLE',
                    createdAt: new Date('2026-02-03'),
                    description: 'Big order'
                }
            ]);

            // 2. Generate settlement
            mockReq = {
                user: adminUser,
                params: {},
                body: {
                    sellerId: seller._id.toString(),
                    periodStart: '2026-02-01',
                    periodEnd: '2026-02-07'
                }
            };

            await generateSettlement(mockReq, mockRes);
            let settlement = mockRes.json.mock.calls[0][0];
            expect(settlement.status).toBe('PENDING_APPROVAL');

            // 3. Approve settlement
            mockRes.json.mockClear();
            mockReq = {
                user: adminUser,
                params: { id: settlement._id.toString() },
                body: { notes: 'Approved' }
            };

            await approveSettlement(mockReq, mockRes);
            settlement = mockRes.json.mock.calls[0][0];
            expect(settlement.status).toBe('APPROVED');

            // 4. Process settlement
            mockRes.json.mockClear();
            mockReq = {
                user: financeUser,
                params: { id: settlement._id.toString() },
                body: { utrNumber: 'UTR123456789' }
            };

            await processSettlement(mockReq, mockRes);
            settlement = mockRes.json.mock.calls[0][0];
            expect(settlement.status).toBe('PROCESSING');

            // 5. Mark as paid
            mockRes.json.mockClear();
            mockReq = {
                user: financeUser,
                params: { id: settlement._id.toString() },
                body: { utrNumber: 'UTR123456789' }
            };

            await markSettlementPaid(mockReq, mockRes);
            settlement = mockRes.json.mock.calls[0][0];
            expect(settlement.status).toBe('PAID');

            // 6. Verify PAYOUT ledger entry created
            const payoutEntry = await SellerLedger.findOne({
                seller: seller._id,
                type: 'PAYOUT'
            });
            expect(payoutEntry).toBeDefined();
        });
    });
});
