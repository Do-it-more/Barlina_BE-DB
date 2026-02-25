# Financial System Implementation Summary

## Overview

This document summarizes the core financial systems implemented for the multi-vendor e-commerce platform. These systems handle seller commissions, payouts, and financial reconciliation.

---

## 1. Seller Ledger System

**File:** `models/SellerLedger.js`

The ledger is the single source of truth for seller earnings. Every financial transaction is recorded here.

### Entry Types:
- `ORDER_CREDIT` - When a customer pays for an order
- `RETURN_DEBIT` - When a customer refund is processed
- `CANCELLATION_DEBIT` - When an order is cancelled
- `SETTLEMENT_DEBIT` - When funds are paid to seller
- `ADJUSTMENT` - Manual corrections

### Status Flow:
```
PENDING → ON_HOLD → ELIGIBLE → SETTLED
                  ↓ (if return/cancel)
               REVERSED
```

### Key Features:
- Running balance calculated automatically
- 7-day hold period after delivery (for returns)
- Automatic fund release via cron job
- GST/TDS tracking

---

## 2. Settlement System

**File:** `models/Settlement.js`, `controllers/settlementController.js`

Handles payout generation and tracking for sellers.

### Settlement States:
- `PENDING` - Generated, awaiting approval
- `APPROVED` - Approved by finance
- `PROCESSING` - Bank transfer initiated
- `COMPLETED` - Funds received by seller
- `FAILED` - Transfer failed
- `ON_HOLD` - Flagged for review

### Workflow:
1. Admin generates settlement for a seller
2. Finance reviews and approves
3. Admin initiates bank transfer
4. Settlement marked as PAID with UTR number

### API Endpoints:

**Seller Routes:**
- `GET /api/settlements/dashboard` - Financial overview
- `GET /api/settlements/ledger` - Transaction history
- `GET /api/settlements/history` - Past settlements

**Admin Routes:**
- `GET /api/settlements/admin/pending` - Pending settlements
- `POST /api/settlements/admin/generate` - Create new settlement
- `PUT /api/settlements/admin/:id/approve` - Approve settlement
- `PUT /api/settlements/admin/:id/process` - Start processing
- `PUT /api/settlements/admin/:id/paid` - Mark as paid

---

## 3. Commission Service

**File:** `services/commissionService.js`

The core engine that handles commission calculations and ledger operations.

### Functions:
- `calculateItemCommission()` - Calculate platform commission for an item
- `createOrderLedgerEntries()` - Create ledger entries when order is paid
- `markEntriesOnHold()` - Start 7-day hold after delivery
- `createReturnDebitEntry()` - Debit seller for refunds
- `createCancellationDebitEntry()` - Debit seller for cancellations
- `populateSellerInfo()` - Add seller attribution to order items

### Commission Calculation:
```
itemTotal = price × quantity
platformCommission = itemTotal × (commissionRate / 100)
sellerShare = itemTotal - platformCommission
```

---

## 4. Order Integration

The order controller (`controllers/orderController.js`) integrates with the commission system at key lifecycle points:

1. **Order Paid** (`updateOrderToPaid`)
   - Creates ledger entries for each seller's items
   - Status: `PENDING`

2. **Order Delivered** (`updateOrderToDelivered`)
   - Marks entries as `ON_HOLD`
   - Sets 7-day hold period

3. **Order Cancelled** (`cancelOrder`)
   - Creates `CANCELLATION_DEBIT` entries
   - Reverses seller credits

---

## 5. Return Integration

When a refund is processed (`controllers/returnController.js`):
- Creates `RETURN_DEBIT` entry
- Reduces seller's available balance

---

## 6. Automated Background Jobs

### Settlement Scheduler (`cron/settlementScheduler.js`)

| Job | Schedule | Description |
|-----|----------|-------------|
| Release Held Funds | Every hour | Marks `ON_HOLD` entries as `ELIGIBLE` when hold period expires |
| Settlement Summary | Daily 6 AM | Logs sellers with funds ready for payout |
| Stale Orders Check | Daily 9 AM | Alerts about orders stuck in processing |

### Automated Finance Jobs (`cron/automatedFinanceJobs.js`)

| Job | Schedule | Description |
|-----|----------|-------------|
| **Weekly Settlements** | Monday 2 AM | Auto-generates settlements for all eligible sellers |
| **Daily Earnings Summary** | Daily 8 PM | Emails sellers their daily earnings & balance |
| **Fraud Detection** | Every 4 hours | Scans for suspicious patterns |
| **Low Inventory Alerts** | Daily 7 AM | Notifies sellers of low/out-of-stock products |

#### Fraud Detection Features:
- High-value orders from new accounts
- Excessive coupon usage
- Multiple users ordering to same address
- Rapid order placement (bot detection)

#### Auto-Approval:
- Settlements ≤ ₹5,000 are auto-approved
- Configurable via `AUTO_APPROVE_THRESHOLD` env var

### Performance Tracking (`cron/performanceTracking.js`)

| Job | Schedule | Description |
|-----|----------|-------------|
| **Monthly Performance Review** | 1st of month, 3 AM | Evaluates all sellers and adjusts tiers/commissions |

#### Performance Tiers:

| Tier | Min Score | Commission Reduction |
|------|-----------|---------------------|
| 💎 Platinum | 90+ | -3% |
| 🥇 Gold | 75-89 | -2% |
| 🥈 Silver | 60-74 | -1% |
| 🥉 Bronze | 40-59 | 0% |
| Standard | 0-39 | 0% |

#### Scoring Metrics:
- **On-Time Delivery** (25%): % of orders delivered by expected date
- **Return Rate** (25%): Lower returns = higher score
- **Customer Rating** (20%): Average product ratings
- **Order Volume** (15%): Orders compared to platform average
- **Response Time** (15%): Query response speed

---

## 7. Coupon Abuse Protection

**File:** `models/Coupon.js`

Enhanced coupon validation to prevent abuse:

- Per-user usage limits
- Global usage limits
- Minimum order value requirements
- Maximum discount caps
- First-order-only restrictions
- Category/seller restrictions
- Rate limiting on validation endpoint

---

## 8. Security Enhancements

**File:** `server.js`

Enabled security middleware:
- `helmet` - Security HTTP headers
- `mongoSanitize` - NoSQL injection protection
- `hpp` - HTTP parameter pollution prevention
- Rate limiting on auth & coupon routes

---

## 9. Queue System (Optional)

**File:** `services/queueService.js`

Background job processing for:
- Email sending
- PDF invoice generation
- Stock updates
- Notifications
- Settlement tasks

**Requires Redis.** Falls back to sync processing if Redis unavailable.

---

## 10. Database Changes

### Order Schema Updates:
```javascript
orderItems: [{
  seller: ObjectId,
  itemTotal: Number,
  sellerShare: Number,
  platformCommission: Number,
  commissionRate: Number,
  settlementStatus: String,
  ledgerEntryId: ObjectId
}],
coupon: {
  code: String,
  discountPercentage: Number,
  discountAmount: Number
},
idempotencyKey: String (unique)
```

---

## 11. Environment Variables

New variables to configure:
```
REDIS_HOST=localhost
REDIS_PORT=6379
DEFAULT_COMMISSION_RATE=10
SETTLEMENT_HOLD_DAYS=7
MIN_SETTLEMENT_AMOUNT=100
GST_RATE=18
TDS_RATE=1
```

---

## 12. Migration Script

**File:** `scripts/migrateOrderSellers.js`

Run to migrate existing orders:
```bash
node scripts/migrateOrderSellers.js
```

This will:
1. Add seller attribution to existing order items
2. Create missing ledger entries for paid orders

---

## Quick Start

1. Install new dependencies:
   ```bash
   cd Backend && npm install
   ```

2. Add Redis config to `.env` (optional, see `.env.example`)

3. Run migration for existing data:
   ```bash
   node scripts/migrateOrderSellers.js
   ```

4. Start server:
   ```bash
   npm run dev
   ```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        ORDER FLOW                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Customer Payment                                           │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────┐    ┌──────────────────┐                   │
│  │ ORDER PAID  │───▶│ Commission Svc   │                   │
│  └─────────────┘    │ createLedger()   │                   │
│                     └────────┬─────────┘                   │
│                              │                              │
│                              ▼                              │
│  ┌──────────────────────────────────────────┐              │
│  │           SELLER LEDGER                   │              │
│  │  ┌────────────────────────────────────┐  │              │
│  │  │ Entry: ORDER_CREDIT                │  │              │
│  │  │ Status: PENDING                    │  │              │
│  │  │ Amount: ₹1000 (net after 10%)     │  │              │
│  │  └────────────────────────────────────┘  │              │
│  └──────────────────────────────────────────┘              │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────┐   (7 days)   ┌────────────────┐       │
│  │ ORDER DELIVERED │───────────────▶│ Cron: Release  │      │
│  │ Status: ON_HOLD │               │ Status: ELIGIBLE│      │
│  └─────────────────┘               └────────────────┘       │
│                                           │                 │
│                                           ▼                 │
│  ┌──────────────────────────────────────────┐              │
│  │           SETTLEMENT                      │              │
│  │  Admin generates → Finance approves →     │              │
│  │  Bank transfer → Mark COMPLETED           │              │
│  └──────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Split Payments** - Integrate with Razorpay Route for automated fund splitting
2. **Dashboard UI** - Build seller financial dashboard in frontend
3. **Automated Settlements** - Auto-generate weekly settlements
4. **Tax Reports** - Generate GST/TDS reports for compliance
