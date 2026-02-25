/**
 * Test Fixtures for Financial System Tests
 * Provides sample data for testing settlements, ledger entries, and sellers
 */

const mongoose = require('mongoose');

// Mock User Data
const mockUsers = {
    seller: {
        _id: new mongoose.Types.ObjectId(),
        name: 'Test Seller',
        email: 'seller@test.com',
        role: 'seller',
        password: 'hashedpassword123',
        isBlocked: false
    },
    superAdmin: {
        _id: new mongoose.Types.ObjectId(),
        name: 'Super Admin',
        email: 'admin@test.com',
        role: 'super_admin',
        password: 'hashedpassword123'
    },
    financeAdmin: {
        _id: new mongoose.Types.ObjectId(),
        name: 'Finance Admin',
        email: 'finance@test.com',
        role: 'finance',
        password: 'hashedpassword123'
    },
    customer: {
        _id: new mongoose.Types.ObjectId(),
        name: 'Test Customer',
        email: 'customer@test.com',
        role: 'user',
        password: 'hashedpassword123'
    }
};

// Mock Seller Data
const mockSeller = {
    _id: new mongoose.Types.ObjectId(),
    user: mockUsers.seller._id,
    businessName: 'Test Business',
    ownerName: 'Test Owner',
    email: 'seller@test.com',
    phone: '9876543210',
    gstNumber: 'GST123456789',
    status: 'APPROVED',
    bankDetails: {
        accountHolderName: 'Test Owner',
        accountNumber: '1234567890',
        ifscCode: 'TEST0001234',
        bankName: 'Test Bank'
    },
    performanceTier: 'STANDARD',
    commissionRate: 10
};

// Mock Order Data
const mockOrder = {
    _id: new mongoose.Types.ObjectId(),
    invoiceNumber: 'INV-TEST-001',
    user: mockUsers.customer._id,
    seller: mockSeller._id,
    items: [
        {
            product: new mongoose.Types.ObjectId(),
            name: 'Test Product',
            quantity: 2,
            price: 500,
            total: 1000
        }
    ],
    totalAmount: 1000,
    paymentStatus: 'Paid',
    orderStatus: 'Delivered',
    deliveredAt: new Date()
};

// Mock Ledger Entry Data
const mockLedgerEntries = {
    orderCredit: {
        _id: new mongoose.Types.ObjectId(),
        seller: mockSeller._id,
        order: mockOrder._id,
        type: 'ORDER_CREDIT',
        grossAmount: 1000,
        commission: 100,
        commissionRate: 10,
        gst: 18,
        tds: 10,
        netAmount: 872, // 1000 - 100 - 18 - 10
        runningBalance: 872,
        description: 'Order credit for INV-TEST-001',
        status: 'ON_HOLD',
        holdUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    },
    eligibleCredit: {
        _id: new mongoose.Types.ObjectId(),
        seller: mockSeller._id,
        order: new mongoose.Types.ObjectId(),
        type: 'ORDER_CREDIT',
        grossAmount: 2000,
        commission: 200,
        commissionRate: 10,
        gst: 36,
        tds: 20,
        netAmount: 1744,
        runningBalance: 2616,
        description: 'Order credit for INV-TEST-002',
        status: 'ELIGIBLE'
    },
    returnDebit: {
        _id: new mongoose.Types.ObjectId(),
        seller: mockSeller._id,
        order: new mongoose.Types.ObjectId(),
        type: 'RETURN_DEBIT',
        grossAmount: -500,
        commission: -50,
        netAmount: -450,
        runningBalance: 2166,
        description: 'Return debit for refund',
        status: 'SETTLED'
    }
};

// Mock Settlement Data
const mockSettlements = {
    pending: {
        _id: new mongoose.Types.ObjectId(),
        settlementNumber: 'STL-202602-0001',
        seller: mockSeller._id,
        periodStart: new Date('2026-02-01'),
        periodEnd: new Date('2026-02-07'),
        grossAmount: 5000,
        totalCommission: 500,
        totalGST: 90,
        totalTDS: 50,
        totalReturns: 200,
        totalDeductions: 840,
        netPayable: 4160,
        ledgerEntries: [],
        status: 'PENDING_APPROVAL',
        createdBy: mockUsers.superAdmin._id
    },
    approved: {
        _id: new mongoose.Types.ObjectId(),
        settlementNumber: 'STL-202601-0001',
        seller: mockSeller._id,
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-07'),
        grossAmount: 10000,
        totalCommission: 1000,
        totalGST: 180,
        totalTDS: 100,
        totalReturns: 0,
        totalDeductions: 1280,
        netPayable: 8720,
        status: 'APPROVED',
        approvedBy: mockUsers.superAdmin._id,
        approvedAt: new Date()
    },
    processing: {
        _id: new mongoose.Types.ObjectId(),
        settlementNumber: 'STL-202512-0001',
        seller: mockSeller._id,
        periodStart: new Date('2025-12-01'),
        periodEnd: new Date('2025-12-07'),
        grossAmount: 8000,
        totalCommission: 800,
        totalGST: 144,
        totalTDS: 80,
        totalDeductions: 1024,
        netPayable: 6976,
        status: 'PROCESSING',
        processedBy: mockUsers.financeAdmin._id,
        processedAt: new Date()
    },
    paid: {
        _id: new mongoose.Types.ObjectId(),
        settlementNumber: 'STL-202511-0001',
        seller: mockSeller._id,
        periodStart: new Date('2025-11-01'),
        periodEnd: new Date('2025-11-07'),
        grossAmount: 15000,
        totalCommission: 1500,
        totalGST: 270,
        totalTDS: 150,
        totalDeductions: 1920,
        netPayable: 13080,
        status: 'PAID',
        paymentInfo: {
            method: 'BANK_TRANSFER',
            utrNumber: 'UTR123456789',
            paidAt: new Date('2025-11-15')
        }
    }
};

// Helper functions
const createMockRequest = (overrides = {}) => ({
    user: mockUsers.superAdmin,
    params: {},
    query: {},
    body: {},
    ...overrides
});

const createMockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
};

// Generate JWT for testing
const generateTestToken = (user) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '1d' }
    );
};

module.exports = {
    mockUsers,
    mockSeller,
    mockOrder,
    mockLedgerEntries,
    mockSettlements,
    createMockRequest,
    createMockResponse,
    generateTestToken
};
