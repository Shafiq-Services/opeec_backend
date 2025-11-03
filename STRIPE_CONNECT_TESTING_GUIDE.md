# Stripe Connect Testing Guide

**Date:** October 28, 2025  
**Purpose:** Complete guide for testing Stripe Connect functionality without filling out real forms

---

## 🎯 Quick Testing Flow

### **Problem Solved**
- ✅ **No more long Stripe forms** - Use test endpoints to simulate webhook events
- ✅ **Proper app redirects** - Pages now redirect back to mobile app via deep links
- ✅ **Status changes** - Simulate pending → active → disabled transitions
- ✅ **Real data testing** - Finance APIs now have realistic dummy data

---

## 🚀 Step-by-Step Testing

### **1. Create Stripe Connect Account**
```bash
POST {{url}}/stripe-connect/create-account
Authorization: Bearer {user_token}
Content-Type: application/json

{
  "country": "US"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Stripe Connect account created successfully",
  "account_id": "acct_1234567890",
  "onboarding_url": "https://connect.stripe.com/setup/e/...",
  "onboarding_completed": false
}
```

### **2. Test Onboarding URL**
- Open the `onboarding_url` in browser
- Instead of filling out the form, just close it
- The redirect pages now properly return to the app using deep links:
  - Success: `opeec://stripe-connect/success`
  - Refresh: `opeec://stripe-connect/refresh`

### **3. Simulate Status Changes (No Forms Required!)**

#### **Change from Pending to Active**
```bash
POST {{url}}/stripe-connect/test/simulate-account-active
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### **Change to Disabled**
```bash
POST {{url}}/stripe-connect/test/simulate-account-disabled
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### **Reset to Pending (for re-testing)**
```bash
POST {{url}}/stripe-connect/test/reset-to-pending
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### **4. Check Status**
```bash
GET {{url}}/stripe-connect/account-status
Authorization: Bearer {user_token}
```

**Response:**
```json
{
  "success": true,
  "account_status": "active",
  "onboarding_completed": true,
  "payouts_enabled": true,
  "account_id": "acct_1234567890"
}
```

### **5. Test Finance APIs (Now with Real Data)**
```bash
GET {{url}}/admin/dashboard/summary
```
- Will show Stripe Payouts and Failed Transfers cards with actual counts

```bash
GET {{url}}/admin/finance/withdrawals?type=stripe
```
- Will return diverse transfer statuses (pending, processing, completed, failed)
- Each transfer has realistic amounts and failure reasons

---

## 🧪 Available Test Endpoints

### **User Testing**
- `POST /stripe-connect/create-account` - Create Stripe account
- `GET /stripe-connect/account-status` - Check current status  
- `POST /stripe-connect/refresh-onboarding` - Get new onboarding URL

### **Status Simulation (Testing Only)**
- `POST /stripe-connect/test/simulate-account-active` - Pending → Active
- `POST /stripe-connect/test/simulate-account-disabled` - Active → Disabled
- `POST /stripe-connect/test/reset-to-pending` - Reset for re-testing
- `GET /stripe-connect/test/users` - List all Stripe Connect users

### **Admin APIs (With Real Data)**
- `GET /admin/dashboard/summary` - Dashboard with Stripe cards
- `GET /admin/finance/withdrawals` - All transfers (mixed statuses)
- `GET /admin/finance/stripe-transfer-details/:orderId` - Transfer details

---

## 📱 Mobile App Deep Links

The redirect pages now use proper deep links:

### **Success Flow**
1. User completes onboarding (or skips for testing)
2. Redirects to `/stripe-connect/success`
3. Page shows success message + countdown
4. Automatically tries `opeec://stripe-connect/success` deep link
5. Returns to app after 3 seconds

### **Refresh Flow**
1. User doesn't complete onboarding
2. Redirects to `/stripe-connect/refresh`  
3. Page shows "setup incomplete" message
4. Automatically tries `opeec://stripe-connect/refresh` deep link
5. Returns to app after 5 seconds

### **Manual Return**
Both pages have "Return to App Now" buttons for immediate deep link trigger.

---

## 🎯 Testing Scenarios

### **Scenario 1: Complete Onboarding**
1. Create account → Status: `pending`
2. Open onboarding URL → Close browser (don't fill forms)
3. Use `simulate-account-active` → Status: `active`
4. Check account status → `onboarding_completed: true`

### **Scenario 2: Failed Onboarding**
1. Create account → Status: `pending`
2. Use `simulate-account-disabled` → Status: `disabled`
3. Check account status → `payouts_enabled: false`

### **Scenario 3: Admin Monitoring**
1. Check dashboard → See Stripe Payouts card with real counts
2. Open finance page → See diverse transfer statuses
3. Filter by status → All filters return data
4. View transfer details → Complete information available

---

## 🔧 Database Changes Applied

The dummy data scripts have created:
- ✅ **10 active Stripe users** with connected accounts
- ✅ **10+ transfers** with mixed statuses (pending, processing, completed, failed)
- ✅ **Realistic amounts** ranging from $25-$500
- ✅ **Failure reasons** for failed transfers
- ✅ **Time calculations** for pending/processing transfers

---

## 🚀 Ready for Frontend Integration

### **Mobile App Developer Can:**
- Test complete Stripe Connect flow without forms
- Handle deep link redirects (`opeec://stripe-connect/success|refresh`)
- Display different account statuses
- Show payout history with real data

### **Admin Panel Developer Can:**
- Display Stripe cards in dashboard
- Show transfer table with filtering
- Handle time remaining calculations
- Display failure alerts and reasons

---

## 🔗 Quick Test Commands

```bash
# 1. Create account
POST {{url}}/stripe-connect/create-account

# 2. Simulate activation
POST {{url}}/stripe-connect/test/simulate-account-active
{ "email": "user@example.com" }

# 3. Check dashboard
GET {{url}}/admin/dashboard/summary

# 4. Check finance data
GET {{url}}/admin/finance/withdrawals

# 5. List all Stripe users
GET {{url}}/stripe-connect/test/users
```

**Result:** Complete Stripe Connect testing without filling a single form! 🎉
