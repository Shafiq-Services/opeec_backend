# Mobile App Changes for Stripe Connect Integration

**Date:** October 27, 2025  
**Feature:** Automated Stripe Connect Payouts for Equipment Owners

---

## 📱 Overview

This document outlines all required changes to the mobile app to support Stripe Connect automated payouts. Equipment owners will now receive automated bank transfers after rentals complete, instead of manually requesting withdrawals.

---

## 🎯 Core Changes Summary

### **For Equipment Owners:**
1. ✅ **Stripe Connect Onboarding** - New setup flow to connect bank account
2. ✅ **Automatic Payouts** - Money arrives in bank 2-7 days after rental completes
3. ✅ **Payout History** - View all automatic transfers
4. ✅ **Wallet Integration** - Wallet still tracks earnings (Stripe transfers shown in history)

### **For Renters:**
- ❌ **No Changes Required** - Payment flow remains exactly the same

---

## 🆕 New API Endpoints (Mobile App Needs to Integrate)

### **1. Stripe Connect Account Management**

#### **POST /stripe-connect/create-account**
**Purpose:** Create Stripe Connect account for equipment owner  
**When to Call:** When owner wants to start receiving automated payouts  
**Headers:**
```json
{
  "Authorization": "Bearer {user_token}",
  "Content-Type": "application/json"
}
```

**Request Body:**
```json
{
  "country": "US"  // Optional, defaults to "US"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Stripe Connect account created successfully",
  "account_id": "acct_1PQXYz2Ab12Cd34",
  "onboarding_url": "https://connect.stripe.com/express/onboarding/xxxxx",
  "onboarding_completed": false
}
```

**Mobile App Action:**
- Open `onboarding_url` in WebView or external browser
- User completes Stripe's KYC verification (bank details, identity)
- After completion, Stripe redirects to success page
- Call `GET /stripe-connect/account-status` to verify completion

---

#### **GET /stripe-connect/account-status**
**Purpose:** Check if owner has completed Stripe Connect onboarding  
**When to Call:**
- On app launch (for equipment owners)
- After returning from Stripe onboarding
- Before allowing equipment listing

**Headers:**
```json
{
  "Authorization": "Bearer {user_token}"
}
```

**Response (Not Connected):**
```json
{
  "success": true,
  "connected": false,
  "account_id": null,
  "onboarding_completed": false,
  "payouts_enabled": false,
  "message": "No Stripe Connect account found. Create one to receive payouts."
}
```

**Response (Connected & Active):**
```json
{
  "success": true,
  "connected": true,
  "account_id": "acct_1PQXYz2Ab12Cd34",
  "onboarding_completed": true,
  "payouts_enabled": true,
  "charges_enabled": false,
  "details_submitted": true,
  "account_status": "active",
  "requirements": {
    "currently_due": [],
    "eventually_due": [],
    "past_due": []
  }
}
```

**Mobile App Action:**
- Show "Connect Bank Account" button if `connected: false`
- Show "Payout Account Active ✓" badge if `payouts_enabled: true`
- Show warning if `requirements.currently_due` is not empty

---

#### **POST /stripe-connect/refresh-onboarding**
**Purpose:** Get new onboarding link if previous one expired  
**When to Call:** If user didn't complete onboarding and link expired

**Response:**
```json
{
  "success": true,
  "message": "Onboarding link refreshed successfully",
  "onboarding_url": "https://connect.stripe.com/express/onboarding/xxxxx"
}
```

---

#### **GET /stripe-connect/payout-history**
**Purpose:** Get user's Stripe payout history  
**When to Call:** Display in payout history screen  
**Query Params:** `?limit=20`

**Response:**
```json
{
  "success": true,
  "payout_history": [
    {
      "order_id": "67250789b5560f4720f1b65",
      "equipment_title": "Excavator CAT 320",
      "equipment_image": "https://...",
      "rental_fee": 100.00,
      "platform_fee": 10.00,
      "penalty_amount": 0,
      "transfer_amount": 90.00,
      "transfer_status": "completed",
      "transfer_id": "tr_1PQXYz2Ab12Cd34",
      "transfer_date": "2025-10-20T10:30:00.000Z",
      "completed_date": "2025-10-20T10:35:00.000Z"
    }
  ],
  "total_count": 15
}
```

---

### **2. Updated Wallet API Response**

#### **GET /wallet**
**Purpose:** Get unified wallet info (NOW includes Stripe transfer history)  
**Changes:** Response now includes Stripe payouts in history

**Response:**
```json
{
  "total_balance": 150.50,
  "pending": [
    {
      "type": "Withdraw Request",
      "amount": -50.00,
      "date": "2025-10-25T14:20:00.000Z",
      "time": "02:20 PM",
      "status": "Pending"
    }
  ],
  "history": [
    {
      "type": "Stripe Payout",    // ← NEW TYPE
      "amount": -85.50,
      "date": "2025-10-20T10:30:00.000Z",
      "time": "10:30 AM",
      "transaction_id": "tr_1PQXYz2Ab12Cd34",
      "reason": "",
      "status": "Paid"
    },
    {
      "type": "Approved",
      "amount": -50.00,
      "date": "2025-10-15T09:00:00.000Z",
      "time": "09:00 AM",
      "transaction_id": "txn_manual_123",
      "reason": "",
      "status": "Approved"
    }
  ]
}
```

**Mobile App Changes:**
- **Detect new type:** `"Stripe Payout"` in history
- **Display differently:** Show Stripe icon/badge for Stripe payouts
- **Status text:** "Paid" means money is in owner's bank
- **No Action Needed:** Wallet balance already correct (backend handles it)

---

## 🎨 UI/UX Changes Required

### **1. Equipment Owner Profile/Settings Screen**

**Add "Payout Settings" Section:**

```
┌─────────────────────────────────────┐
│  Payout Settings                    │
├─────────────────────────────────────┤
│                                     │
│  💳 Stripe Connect                  │
│  ● Active - Bank Ending in 4567     │  ← If connected
│  Last payout: 2 days ago            │
│                                     │
│  [View Payout History]              │
│                                     │
└─────────────────────────────────────┘
```

**Or if not connected:**

```
┌─────────────────────────────────────┐
│  Payout Settings                    │
├─────────────────────────────────────┤
│                                     │
│  💳 Connect Your Bank Account       │
│  Receive automatic payouts after    │
│  each rental completes.             │
│                                     │
│  [Connect Bank Account]             │
│                                     │
└─────────────────────────────────────┘
```

**Implementation:**
- Call `GET /stripe-connect/account-status` on screen load
- Show "Connect Bank Account" button if not connected
- On button tap → Call `POST /stripe-connect/create-account`
- Open returned `onboarding_url` in WebView
- After return → Poll `GET /stripe-connect/account-status` to check completion

---

### **2. Equipment Listing Flow**

**Optional: Require Stripe Connect Before Listing**

```
If (user wants to list equipment) {
  1. Check stripe_connect.account_status
  2. If not active:
     Show modal: "Connect your bank account to receive payments"
     [Connect Now] or [Cancel]
  3. After connection → Proceed with listing
}
```

**Implementation Decision:**
- **Strict Mode:** Block listing until Stripe connected (prevents payment issues)
- **Lenient Mode:** Allow listing but show warning banner (owner flexibility)

*Recommendation: Use Strict Mode to avoid situations where rentals complete but owner can't receive money.*

---

### **3. Wallet Screen Updates**

**No Major UI Changes - Just Handle New Transaction Type**

**Current History Item:**
```
┌─────────────────────────────────────┐
│  Approved                           │
│  -$50.00            Oct 15, 09:00 AM│
│  Transaction ID: txn_manual_123     │
└─────────────────────────────────────┘
```

**New Stripe Payout Item:**
```
┌─────────────────────────────────────┐
│  💳 Stripe Payout                   │  ← Add Stripe icon
│  -$85.50            Oct 20, 10:30 AM│
│  Transfer ID: tr_1PQXYz2Ab...       │
│  Status: Paid ✓                     │  ← Show bank transfer completed
└─────────────────────────────────────┘
```

**Code Changes:**
```dart
// Example in Flutter
Widget buildHistoryItem(HistoryItem item) {
  IconData icon;
  String title;
  
  if (item.type == "Stripe Payout") {
    icon = Icons.account_balance;  // Bank icon
    title = "Stripe Payout";
    // Show "Paid ✓" status
  } else if (item.type == "Approved") {
    icon = Icons.check_circle;
    title = "Manual Withdrawal";
  }
  
  // Rest of your existing code...
}
```

---

### **4. New "Payout History" Screen (Optional)**

**Dedicated screen for viewing all Stripe payouts:**

```
┌─────────────────────────────────────┐
│  ← Payout History                   │
├─────────────────────────────────────┤
│                                     │
│  📦 Excavator CAT 320               │
│  $90.00                Oct 20, 2025 │
│  ✓ Paid to bank                     │
│                                     │
│  📦 Generator 5000W                 │
│  $45.50                Oct 15, 2025 │
│  🕐 Processing (2-7 days)            │
│                                     │
│  📦 Concrete Mixer                  │
│  $67.00                Oct 10, 2025 │
│  ✓ Paid to bank                     │
│                                     │
└─────────────────────────────────────┘
```

**API Call:** `GET /stripe-connect/payout-history?limit=20`

**Implementation:**
- Accessible from "Payout Settings" screen
- Shows all automatic Stripe payouts
- Display transfer status (Processing, Completed, Failed)
- Tap item to see order details

---

## 📊 Status Badge Display Logic

**Equipment Owner Profile:**

```dart
String getPayoutStatusText(AccountStatus status) {
  if (status.connected && status.payouts_enabled) {
    return "✓ Active - Automatic Payouts Enabled";
  } else if (status.connected && !status.onboarding_completed) {
    return "⏳ Onboarding Incomplete";
  } else {
    return "❌ Not Connected - Connect to Receive Payouts";
  }
}
```

**Color Coding:**
- 🟢 Green: Active & payouts enabled
- 🟡 Yellow: Account created but onboarding incomplete
- 🔴 Red: Not connected
- 🟠 Orange: Requirements need attention

---

## 🔔 Push Notifications (Optional Enhancement)

**New notification types to handle:**

### **Payout Completed:**
```json
{
  "type": "stripe_payout_completed",
  "title": "Payout Received",
  "message": "$85.50 has been transferred to your bank account",
  "data": {
    "order_id": "67250789b5560f4720f1b65",
    "amount": 85.50
  }
}
```

### **Payout Failed:**
```json
{
  "type": "stripe_payout_failed",
  "title": "Payout Failed",
  "message": "Transfer for order #123 failed. Please update your bank details.",
  "data": {
    "order_id": "67250789b5560f4720f1b65"
  }
}
```

**Mobile App Action:**
- Show notification
- Deep link to payout history or settings screen
- Highlight failed payout for user action

---

## 🧪 Testing Checklist

### **Onboarding Flow:**
- [ ] Owner can create Stripe Connect account
- [ ] WebView/browser opens Stripe onboarding
- [ ] After completion, status shows "Active"
- [ ] Onboarding link can be refreshed if expired

### **Payout Display:**
- [ ] Wallet history shows Stripe payouts correctly
- [ ] Stripe icon/badge displays properly
- [ ] Transaction ID is visible and copyable
- [ ] Status text shows correct state (Processing/Paid)

### **Edge Cases:**
- [ ] Handle network errors gracefully
- [ ] Show loading states during API calls
- [ ] Display error if Stripe onboarding fails
- [ ] Warn user if requirements need attention
- [ ] Handle expired onboarding links

### **User Experience:**
- [ ] Onboarding flow feels smooth (not too many steps)
- [ ] Status badges are clear and understandable
- [ ] Payout history loads quickly
- [ ] Wallet balance remains accurate

---

## 🚀 Deployment Strategy

### **Phase 1: Soft Launch (Recommended)**
1. **Feature Flag:** Add "enable_stripe_connect" flag
2. **Gradual Rollout:** Enable for 10% of owners first
3. **Monitor:** Watch for onboarding completion rate
4. **Iterate:** Fix UX issues before full rollout

### **Phase 2: Full Launch**
1. Enable for all new owners
2. Show in-app banner to existing owners
3. Optional: Make Stripe Connect mandatory for new listings

---

## ❓ FAQ for Mobile Developers

### **Q: Does existing payment flow change for renters?**
**A:** No. Renters still pay exactly the same way. Only owner payout method changes.

### **Q: What happens to existing wallet withdrawal requests?**
**A:** They still work! Owners can use both systems:
- Manual withdrawal requests (existing flow)
- Automatic Stripe payouts (new flow)

### **Q: Do we need to handle Stripe SDK directly?**
**A:** No. Backend creates Stripe accounts and provides onboarding URLs. You just need to open the URL in WebView/browser.

### **Q: What if owner's bank transfer fails?**
**A:** Backend sends notification. Show user message to update bank details via Stripe dashboard.

### **Q: Can owner change their bank account?**
**A:** Yes. They can update via Stripe dashboard (link provided in settings).

### **Q: How do we test without real bank accounts?**
**A:** Use Stripe test mode with test account numbers provided by Stripe documentation.

---

## 📞 Backend Integration Points

### **API Base URL:**
```
Production: https://api.opeec.com
Development: http://localhost:5001
```

### **Authentication:**
All endpoints require JWT token in header:
```
Authorization: Bearer {user_token}
```

### **Error Handling:**
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

**Common Error Codes:**
- `400`: Invalid request (check params)
- `401`: Unauthorized (token expired/invalid)
- `404`: Resource not found
- `500`: Server error (retry or contact backend team)

---

## 📝 Summary of Required Changes

### **Minimal Implementation (Must Have):**
1. ✅ Add "Connect Bank Account" button in profile/settings
2. ✅ Open Stripe onboarding URL in WebView
3. ✅ Display "Stripe Payout" type in wallet history
4. ✅ Show payout account status badge

### **Recommended Implementation:**
5. ✅ Dedicated payout history screen
6. ✅ Require Stripe Connect before equipment listing
7. ✅ Handle push notifications for payout events

### **Optional Enhancements:**
8. ⭐ Estimated payout arrival time calculator
9. ⭐ Payout analytics dashboard (monthly earnings chart)
10. ⭐ Bank account last 4 digits display

---

**Need Help?**
Contact Backend Team for API testing, webhook debugging, or integration questions.

**Estimated Development Time:** 3-5 days (depending on UX complexity)

