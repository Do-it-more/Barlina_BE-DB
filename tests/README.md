# Financial System Test Suite

This document describes the automated test suite for the financial dashboard features including Seller Ledger, Settlements, and API endpoints.

## 📋 Test Coverage

### 1. SellerLedger Model Tests (`tests/models/sellerLedger.test.js`)

| Test Category | Tests | Description |
|---------------|-------|-------------|
| Schema Validation | 4 | Required fields, default values, type validation |
| Entry Types | 5 | ORDER_CREDIT, RETURN_DEBIT, CANCELLATION_DEBIT, SETTLEMENT_DEBIT, ADJUSTMENT |
| Status Transitions | 3 | PENDING → ON_HOLD → ELIGIBLE → SETTLED |
| Balance Calculation | 4 | `getSellerBalance()` for eligible, on-hold, pending amounts |
| Eligible Entries | 2 | `getEligibleEntries()` with date filtering |
| Commission Calculation | 3 | Commission, GST, TDS deductions |

**Total: 21 tests**

---

### 2. Settlement Model Tests (`tests/models/settlement.test.js`)

| Test Category | Tests | Description |
|---------------|-------|-------------|
| Schema Validation | 3 | Required fields, auto-generated settlement number |
| Status Values | 6 | All valid statuses + invalid status rejection |
| Settlement Number | 2 | Unique generation, year/month format |
| Payment Information | 3 | UTR tracking, approval/processing timestamps |
| Settlement Generation | 4 | `generateSettlement()`, deductions, linking entries |
| Financial Calculations | 3 | Net payable, zero commission, high returns |
| Period Validation | 2 | Date range storage |
| Seller Relationship | 2 | Population, filtering by seller |

**Total: 25 tests**

---

### 3. Settlement Controller Tests (`tests/controllers/settlementController.test.js`)

| Test Category | Tests | Description |
|---------------|-------|-------------|
| Seller Dashboard | 3 | Balance breakdown, transactions, 404 handling |
| Seller Ledger | 4 | Pagination, type/status/date filtering |
| Seller Settlements | 3 | History retrieval, status filter, pagination |
| Admin Stats | 1 | Status counts, total paid calculation |
| Admin All Settlements | 4 | Filtering, seller filter, totals |
| Admin Pending | 1 | Pending + approved settlements |
| Generate Settlement | 2 | Success, missing fields |
| Approve Settlement | 3 | Success, 404, invalid status |
| Reject Settlement | 2 | Success, invalid status |
| Process Settlement | 2 | Success, invalid status |
| Mark Paid | 3 | Success, ledger entry creation, invalid status |
| Workflow Integration | 1 | Full end-to-end settlement workflow |

**Total: 29 tests**

---

### 4. API Routes Tests (`tests/routes/settlementRoutes.test.js`)

| Test Category | Tests | Description |
|---------------|-------|-------------|
| Authentication | 2 | Token validation, role checks |
| Status Workflow | 3 | Progression, rejection, invalid transitions |
| Error Handling | 2 | 404, validation errors |
| Pagination & Filtering | 4 | Page size, status filter, seller filter, date range |
| Aggregations | 3 | Total paid, commission, status counts |

**Total: 14 tests**

---

## 🛠️ Installation

Before running tests, install the required dev dependencies:

```bash
cd Backend
npm install --save-dev jest supertest mongodb-memory-server @types/jest
```

## 🚀 Running Tests

### Run All Tests
```bash
npm test
```

### Run Financial Tests Only
```bash
npm run test:financial
```

### Watch Mode (Development)
```bash
npm run test:watch
```

### Generate Coverage Report
```bash
npm run test:coverage
```

## 📊 Expected Output

```
PASS  tests/models/sellerLedger.test.js (6.5s)
  SellerLedger Model
    Schema Validation
      ✓ should create a valid ledger entry with all required fields (25 ms)
      ✓ should reject invalid entry type (5 ms)
      ✓ should reject entry without seller (3 ms)
      ✓ should set default status to PENDING (8 ms)
    Entry Types
      ✓ should accept ORDER_CREDIT type (5 ms)
      ✓ should accept RETURN_DEBIT type (4 ms)
      ...

PASS  tests/models/settlement.test.js (7.2s)
  Settlement Model
    Schema Validation
      ✓ should create a valid settlement with required fields (15 ms)
      ✓ should auto-generate settlement number (8 ms)
      ...

PASS  tests/controllers/settlementController.test.js (8.5s)
  Settlement Controller
    Seller Endpoints
      GET /api/settlements/dashboard - getSellerFinancialDashboard
        ✓ should return financial dashboard for seller (25 ms)
        ...

Test Suites: 4 passed, 4 total
Tests:       89 passed, 89 total
Snapshots:   0 total
Time:        22.5 s
```

## 🔧 Test Configuration

The test suite uses:

- **Jest** - Testing framework
- **MongoDB Memory Server** - In-memory database for isolated tests
- **Supertest** - HTTP assertion library (for API tests)

Configuration is in `jest.config.js`:

```javascript
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    testTimeout: 30000
};
```

## 📁 Test File Structure

```
Backend/
├── tests/
│   ├── setup.js                          # Test environment setup
│   ├── fixtures/
│   │   └── financialFixtures.js          # Mock data for tests
│   ├── models/
│   │   ├── sellerLedger.test.js          # Ledger model tests
│   │   └── settlement.test.js            # Settlement model tests
│   ├── controllers/
│   │   └── settlementController.test.js  # Controller tests
│   └── routes/
│       └── settlementRoutes.test.js      # API route tests
├── jest.config.js                         # Jest configuration
└── package.json                           # Updated with test scripts
```

## 🎯 Key Test Scenarios

### 1. Balance Calculation Test
```javascript
it('should calculate eligible balance correctly', async () => {
    const balance = await SellerLedger.getSellerBalance(seller._id);
    expect(balance.eligible).toBe(2520);  // Sum of eligible entries
    expect(balance.onHold).toBe(450);     // On-hold entries
    expect(balance.pending).toBe(270);    // Pending entries
});
```

### 2. Settlement Workflow Test
```javascript
it('should complete full settlement workflow', async () => {
    // 1. Generate → PENDING_APPROVAL
    // 2. Approve → APPROVED
    // 3. Process → PROCESSING
    // 4. Mark Paid → PAID
    // 5. Verify PAYOUT ledger entry created
});
```

### 3. Financial Calculation Test
```javascript
it('should calculate net payable correctly', async () => {
    // Gross: 10000
    // Commission: 1000 (10%)
    // GST: 180 (18% on commission)
    // TDS: 100 (1%)
    // Returns: 500
    // Net = 10000 - 1780 = 8220
    expect(settlement.netPayable).toBe(8220);
});
```

## ✅ Test Best Practices

1. **Isolation**: Each test runs in a clean database state
2. **Fixtures**: Reusable mock data in `fixtures/` directory
3. **Coverage**: Tests cover happy path and error scenarios
4. **Async Handling**: Proper async/await pattern throughout
5. **Descriptive Names**: Clear test descriptions for documentation

## 🐛 Debugging Tests

### Run a Single Test File
```bash
npx jest tests/models/settlement.test.js --verbose
```

### Run with Debug Output
```bash
DEBUG=* npm test
```

### Check Coverage Gaps
```bash
npm run test:coverage
# Open coverage/lcov-report/index.html in browser
```
