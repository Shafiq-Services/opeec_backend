# 🏦 Wallet & Withdrawals Module Documentation

## Overview

The Wallet & Withdrawals module is an **additive feature** that provides seller earnings tracking and payout management for the OPEEC equipment rental platform. This module integrates seamlessly with existing order flows without modifying any current API contracts, Stripe processes, or business logic.

## ⚠️ Safety & Production Compatibility

- **✅ Additive Only**: No existing files were modified beyond adding imports and function calls
- **✅ API Contracts Preserved**: All existing endpoint responses remain unchanged
- **✅ Stripe Flows Intact**: Payment processing and refunds work exactly as before
- **✅ Business Logic Safe**: Settlement calculations use existing stored Order breakdown fields
- **✅ Zero Downtime**: Module can be deployed safely to production with zero risk to current functionality

## 🏗️ Architecture

### Database Models

#### 1. SellerWallet (`models/sellerWallet.js`)
Caches computed balance information for each seller:
```javascript
{
  sellerId: ObjectId,           // Reference to User who owns equipment
  available_balance: Number,    // Funds available for withdrawal
  pending_balance: Number,      // Funds approved but not yet paid out
  total_balance: Number,        // Total earnings (available + pending)
  last_transaction_id: ObjectId, // Last processed transaction
  balance_updated_at: Date      // Cache timestamp
}
```

#### 2. TransactionLog (`models/transactionLog.js`)
Records all money movements with detailed audit trail:
```javascript
{
  sellerId: ObjectId,
  type: String,                 // ORDER_EARNING, PENALTY, REFUND, etc.
  amount: Number,               // Positive = credit, Negative = debit
  description: String,
  orderId: ObjectId,            // Related order (if applicable)
  withdrawalRequestId: ObjectId, // Related withdrawal (if applicable)
  status: String,               // completed, pending, failed
  metadata: Object              // Audit trail and reference data
}
```

**Transaction Types:**
- `ORDER_EARNING`: Positive amount credited when rental completes successfully
- `PENALTY`: Negative amount when seller penalty exceeds deposit coverage
- `REFUND`: Negative amount when refund reduces seller earnings
- `DEPOSIT_REFUND`: Negative amount when deposit is refunded to renter
- `SELLER_PAYOUT`: Negative amount when funds are paid out to seller
- `WITHDRAW_REQUEST_HOLD`: Negative amount when funds are held for withdrawal
- `WITHDRAW_REQUEST_RELEASE`: Positive amount when held funds are released

#### 3. WithdrawalRequest (`models/withdrawalRequest.js`)
Tracks seller payout requests through approval workflow:
```javascript
{
  sellerId: ObjectId,
  amount: Number,
  status: String,               // Pending, Approved, Paid, Rejected
  payment_method: Object,       // Bank transfer, PayPal, etc.
  reviewed_by_admin_id: ObjectId,
  rejection_reason: String,
  external_reference: Object    // Payment confirmation details
}
```

## 🛠️ Services & Utilities

### Wallet Service (`utils/walletService.js`)
Core wallet management functionality:
- `ensureWallet(sellerId)`: Creates wallet if missing (idempotent)
- `computeAndUpdateBalance(sellerId)`: Recomputes balances from transaction log
- `getUnifiedHistory(sellerId, options)`: Returns paginated history combining transactions and withdrawals
- `createTransaction(data)`: Creates new transaction and updates balances
- `getWalletBalances(sellerId)`: Gets current cached balances

### Settlement Rules (`utils/settlementRules.js`)
Business logic for determining settlement amounts:
- `calculateSellerEarnings(order)`: Derives seller share from existing Order breakdown
- `determineSettlement(order, event)`: Maps order lifecycle events to transaction types
- `validateOrderForSettlement(order)`: Ensures order has required pricing data

## 📡 API Endpoints

### Seller-Facing Endpoints

#### GET `/wallet`
Returns wallet balances and transaction history for mobile app.

**Authentication**: User JWT required
**Query Parameters**:
- `page` (optional): Page number for history (default: 1)
- `limit` (optional): Items per page (default: 20)
- `type` (optional): Filter by transaction type

**Response**:
```json
{
  "message": "Wallet information retrieved successfully",
  "wallet": {
    "available_balance": 125.50,
    "pending_balance": 50.00,
    "total_balance": 175.50
  },
  "history": [...],
  "pagination": {...}
}
```

#### POST `/withdrawals`
Creates a new withdrawal request.

**Authentication**: User JWT required
**Body**:
```json
{
  "amount": 100.00,
  "payment_method": {
    "type": "bank_transfer",
    "details": {
      "account_number": "1234567890",
      "routing_number": "123456789",
      "account_holder_name": "John Doe",
      "bank_name": "Example Bank"
    }
  }
}
```

**Validation**:
- Amount must not exceed available balance
- Payment method type must be valid
- Creates hold transaction to reserve funds

#### GET `/withdrawals`
Returns seller's own withdrawal requests.

**Authentication**: User JWT required
**Query Parameters**: Same pagination as wallet endpoint

### Admin-Facing Endpoints

#### GET `/admin/withdrawals`
Returns all withdrawal requests for admin review.

**Authentication**: Admin JWT required
**Query Parameters**:
- `status` (optional): Filter by status (Pending, Approved, Paid, Rejected)
- Standard pagination parameters

#### POST `/admin/withdrawals/:id/approve`
Approves a pending withdrawal request.

**Authentication**: Admin JWT required
**Action**: Moves funds from available to pending balance

#### POST `/admin/withdrawals/:id/reject`
Rejects a withdrawal request with reason.

**Authentication**: Admin JWT required
**Body**: `{ "rejection_reason": "..." }`
**Action**: Releases held funds back to available balance

#### POST `/admin/withdrawals/:id/mark-paid`
Marks an approved withdrawal as paid and finalizes payout.

**Authentication**: Admin JWT required
**Body**: Optional external reference information
**Action**: Creates `SELLER_PAYOUT` transaction to complete the withdrawal

## 🔄 Order Lifecycle Integration

The wallet system listens to existing order status transitions without modifying current flows:

### Successful Completion (Returned → Finished)
```javascript
// Creates ORDER_EARNING transaction
amount: +order.rental_fee  // Seller gets rental fee (platform keeps platform_fee)
```

### Cancellation (Booked → Cancelled)
```javascript
// Before cutoff: No seller earning
// After cutoff: Partial seller earning based on business rules
```

### Late Return with Penalty
```javascript
// Creates ORDER_EARNING + potential PENALTY transaction
// If penalty > deposit: seller pays the difference
```

### Deposit Refunds
```javascript
// Creates DEPOSIT_REFUND transaction when deposit returned to renter
amount: -order.deposit_amount
```

## 🛡️ Data Safety & Validation

### Race Condition Protection
- Atomic balance updates using MongoDB transactions
- Wallet operations are idempotent where possible
- Settlement processing continues even if wallet updates fail

### Validation Rules
- Withdrawal amounts cannot exceed available balance
- Only valid payment method types accepted
- Order settlement uses existing stored breakdown (no recalculation)
- Admin actions require proper status transitions

### Indexing Strategy
```javascript
// Optimized for common query patterns
SellerWallet: { sellerId: 1 }
TransactionLog: { sellerId: 1, createdAt: -1 }
WithdrawalRequest: { sellerId: 1, status: 1, createdAt: -1 }
```

## 🔧 Deployment & Maintenance

### Backfill Script
```bash
# Create wallets for existing sellers
node scripts/backfillWallets.js

# Preview changes without applying
node scripts/backfillWallets.js --dry-run

# Create wallets and recompute all balances
node scripts/backfillWallets.js --recompute-balances
```

### Database Migrations
No migrations required - all new collections with proper indexes.

### Monitoring
- Console logging for all wallet operations
- Admin notifications for withdrawal status changes
- Error handling preserves existing order processing

## 🧪 Testing

### API Testing
Use the examples in `tests/wallet-api-examples.js` for:
- Postman collection import
- Frontend integration reference
- Validation scenario testing

### Key Test Scenarios
1. **Normal Flow**: Order completion → Earnings → Withdrawal → Admin approval → Payout
2. **Insufficient Balance**: Attempt withdrawal exceeding available funds
3. **Cancellation Flow**: Early vs late cancellation settlement differences
4. **Penalty Scenarios**: Late returns with penalties exceeding deposit coverage

## 📊 Business Rules Summary

### Settlement Timing
- **Early Cancellation**: No seller earnings, full refund to buyer
- **Late Cancellation**: Seller gets rental fee, partial refund to buyer  
- **Normal Completion**: Seller gets rental fee, platform keeps platform fee
- **Late Completion**: Seller gets rental fee minus any penalty beyond deposit

### Fee Distribution
```
Total Order Amount = Rental Fee + Platform Fee + Tax + Insurance/Deposit
Seller Earnings = Rental Fee (only)
Platform Revenue = Platform Fee + Tax
```

### Withdrawal Workflow
1. **Request**: Seller creates withdrawal request → Funds held
2. **Review**: Admin approves/rejects → Funds moved to pending/released
3. **Payment**: Admin marks as paid → Final payout transaction created

## 🔗 Integration Points

### Existing Systems
- **Orders**: Listens to status changes in `controllers/orders.js`
- **Stripe**: Uses existing refund flows, no new Stripe integration
- **Admin Notifications**: Follows existing notification patterns
- **Authentication**: Uses existing JWT middleware for users and admins

### File Structure
```
models/
├── sellerWallet.js           # NEW: Wallet balance cache
├── transactionLog.js         # NEW: Money movement audit trail  
└── withdrawalRequest.js      # NEW: Payout request tracking

controllers/
├── walletController.js       # NEW: Seller wallet endpoints
├── withdrawalController.js   # NEW: Seller withdrawal endpoints
├── adminWithdrawalController.js # NEW: Admin withdrawal management
└── settlementController.js   # NEW: Order lifecycle settlement

routes/
├── wallet.routes.js          # NEW: Wallet endpoints
├── withdrawal.routes.js      # NEW: Withdrawal endpoints  
└── admin.withdrawal.routes.js # NEW: Admin withdrawal endpoints

utils/
├── walletService.js          # NEW: Core wallet operations
└── settlementRules.js        # NEW: Settlement calculation logic

scripts/
└── backfillWallets.js        # NEW: One-time setup script
```

## 🚀 Deployment Checklist

- [ ] Run backfill script to create wallets for existing sellers
- [ ] Verify no existing API responses changed (regression test)
- [ ] Test wallet endpoints with valid user/admin JWT tokens
- [ ] Confirm Stripe charges and refunds work unchanged
- [ ] Monitor console logs for settlement processing
- [ ] Test withdrawal creation and admin approval workflow

## 🎯 Future Enhancements

This additive design allows for future extensions:
- Automated payout scheduling
- Multi-currency support
- Advanced penalty calculation rules
- Integration with additional payment providers
- Real-time balance notifications via WebSocket

---

**Module Status**: ✅ Production Ready  
**Breaking Changes**: None  
**Dependencies**: Existing MongoDB, JWT, Admin notification system  
**Maintenance**: Minimal - leverages existing Order data and flows
