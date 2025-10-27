# 🔐 STRIPE IDENTITY VERIFICATION - COMPLETE DOCUMENTATION

## 📋 OVERVIEW

This system implements Stripe Identity verification for all users before they can rent equipment. The verification is backend-driven, webhook-based, and requires a one-time $2 fee.

---

## 🚀 IMPLEMENTATION SUMMARY

### ✅ What's Been Implemented:

1. **User Model Updates**
   - Added `stripe_verification` field with status tracking
   - Status options: `not_verified`, `pending`, `verified`, `failed`
   - Tracks verification attempts, payment, and timestamps

2. **App Settings Configuration**
   - `verification_fee` (default: $2.00)
   - `verification_title`
   - `verification_description`
   - Admin can configure these via `/admin/settings`

3. **Verification APIs**
   - `POST /user/verification/initiate` - Start verification + charge fee
   - `POST /user/verification/webhook` - Stripe webhook handler
   - `GET /user/verification/status` - Get current status

4. **Updated Existing APIs**
   - Login includes verification status
   - User profile includes verification status
   - Admin user list includes verification status
   - Order creation blocks unverified users

5. **Admin APIs**
   - `GET /admin/users/verification-filter` - Filter by status
   - `GET /admin/users/:userId/verification-history` - View attempts

6. **Migration Script**
   - `scripts/migrateStripeVerification.js` - Add field to existing users

---

## 🔧 ENVIRONMENT VARIABLES

Add these to your `.env` file:

```env
# Existing variables
MONGODB_URI=mongodb://...
JWT_SECRET=your_jwt_secret

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...

# Email Configuration (existing)
EMAIL=your@email.com
EMAIL_PASSWORD=your_password
```

---

## 🎯 HOW IT WORKS

### User Flow:
1. User signs up → `stripe_verification.status = 'not_verified'`
2. User tries to rent equipment → Gets 403 error with verification requirement
3. User initiates verification → Backend charges $2 fee → Creates Stripe session
4. User completes Stripe Identity check (ID + selfie)
5. Stripe webhook updates user status → `status = 'verified'`
6. User can now rent equipment

### Backend Flow:
```
POST /user/verification/initiate
  ↓
Check if already verified
  ↓
Charge $2 verification fee
  ↓
Create Stripe Identity session
  ↓
Update user: status = 'pending'
  ↓
Return session_url to frontend
  ↓
User completes verification
  ↓
Stripe sends webhook
  ↓
Update user: status = 'verified'
  ↓
Send push notification to user
```

---

## 📡 API ENDPOINTS

### **1. Initiate Verification**
```http
POST /user/verification/initiate
Authorization: Bearer {user_token}
Content-Type: application/json

{
  "return_url": "myapp://verification-complete",
  "payment_method_id": "pm_1234567890"
}
```

**Response:**
```json
{
  "message": "Verification session created successfully",
  "session_url": "https://verify.stripe.com/start/...",
  "session_id": "vs_1234567890",
  "client_secret": "vs_1234567890_secret_...",
  "verification_fee": {
    "amount": 2.00,
    "currency": "usd",
    "payment_intent_id": "pi_1234567890"
  },
  "verification_info": {
    "title": "Identity Verification Required",
    "description": "To ensure a safe and secure rental experience...",
    "fee": 2.00
  }
}
```

### **2. Check Verification Status**
```http
GET /user/verification/status
Authorization: Bearer {user_token}
```

**Response:**
```json
{
  "verification_status": "verified",
  "verified_at": "2024-01-15T10:30:00Z",
  "session_id": "vs_1234567890",
  "attempts": [
    {
      "session_id": "vs_1234567890",
      "status": "verified",
      "created_at": "2024-01-15T10:25:00Z",
      "completed_at": "2024-01-15T10:30:00Z"
    }
  ],
  "last_attempt_at": "2024-01-15T10:25:00Z",
  "fee_paid": true
}
```

### **3. Webhook Handler** (Stripe calls this)
```http
POST /user/verification/webhook
Stripe-Signature: t=1234567890,v1=...
Content-Type: application/json

{
  "type": "identity.verification_session.verified",
  "data": { ... }
}
```

### **4. Create Order** (Modified)
```http
POST /order/add
Authorization: Bearer {user_token}
```

**If not verified:**
```json
{
  "message": "Identity verification required to rent equipment",
  "error_code": "verification_required",
  "verification_status": "not_verified",
  "require_verification": true,
  "verification_url": "/user/verification/initiate"
}
```

### **5. Admin Filter Users**
```http
GET /admin/users/verification-filter?status=pending
Authorization: Bearer {admin_token}
```

### **6. Admin View History**
```http
GET /admin/users/507f1f77bcf86cd799439011/verification-history
Authorization: Bearer {admin_token}
```

---

## 🗄️ DATABASE SCHEMA

### User Model Addition:
```javascript
stripe_verification: {
  status: 'not_verified' | 'pending' | 'verified' | 'failed',
  session_id: String,
  verification_reference: String,
  attempts: [{
    session_id: String,
    status: String,
    created_at: Date,
    completed_at: Date,
    failure_reason: String
  }],
  verified_at: Date,
  last_attempt_at: Date,
  verification_fee_paid: Boolean,
  payment_intent_id: String
}
```

### AppSettings Model Addition:
```javascript
verification_fee: Number (default: 2.00),
verification_title: String,
verification_description: String
```

---

## 🔄 MIGRATION

### Run Migration Script:
```bash
node scripts/migrateStripeVerification.js
```

This will:
- Add `stripe_verification` field to all existing users
- Set default status to `not_verified`
- Show progress and summary

---

## ⚙️ STRIPE SETUP

### 1. Enable Stripe Identity:
- Go to Stripe Dashboard → Identity
- Enable Identity product
- Configure verification settings

### 2. Set up Webhook:
- Go to Developers → Webhooks
- Add endpoint: `https://your-domain.com/user/verification/webhook`
- Select events:
  - `identity.verification_session.verified`
  - `identity.verification_session.requires_input`
  - `identity.verification_session.canceled`
- Copy webhook secret → Add to `.env` as `STRIPE_CONNECT_WEBHOOK_SECRET`

### 3. Test Mode:
- Use Stripe test keys during development
- Test webhook with Stripe CLI:
  ```bash
  stripe listen --forward-to localhost:5001/user/verification/webhook
  ```

---

## 🎨 FRONTEND INTEGRATION

### Mobile App (React Native / Flutter):

#### 1. Check Verification on App Load:
```javascript
const user = await GET('/user/profile');
if (user.stripe_verification.status !== 'verified') {
  // Show verification banner or prompt
}
```

#### 2. Handle Rental Attempt:
```javascript
try {
  const order = await POST('/order/add', orderData);
  // Success
} catch (error) {
  if (error.error_code === 'verification_required') {
    // Show verification dialog
    showVerificationDialog(error.verification_status);
  }
}
```

#### 3. Start Verification:
```javascript
async function startVerification(paymentMethodId) {
  const response = await POST('/user/verification/initiate', {
    return_url: 'myapp://verification-complete',
    payment_method_id: paymentMethodId
  });
  
  // Open Stripe Identity session
  await Linking.openURL(response.session_url);
}
```

#### 4. Handle Return:
```javascript
Linking.addEventListener('url', async (event) => {
  if (event.url.includes('verification-complete')) {
    // Webhook already updated status, just refresh
    await refreshUserProfile();
    showSuccess('Verification complete!');
  }
});
```

### Admin Panel (React/Next.js):

#### 1. User List with Verification Status:
```javascript
<Table>
  <Column field="name" header="Name" />
  <Column 
    field="stripe_verification.status" 
    header="Verification"
    body={(user) => (
      <Badge color={getStatusColor(user.stripe_verification.status)}>
        {user.stripe_verification.status}
      </Badge>
    )}
  />
</Table>
```

#### 2. Filter Users:
```javascript
const pendingUsers = await GET('/admin/users/verification-filter?status=pending');
```

#### 3. View History:
```javascript
const history = await GET(`/admin/users/${userId}/verification-history`);
```

---

## 🧪 TESTING

### Test Scenarios:

1. **New User Flow:**
   - Signup → Try to rent → See verification requirement
   - Complete verification → Rent successfully

2. **Already Verified User:**
   - Login → Try to rent → Success (no verification prompt)

3. **Failed Verification:**
   - Start verification → Fail → See retry option
   - Retry → Success

4. **Webhook Testing:**
   - Use Stripe CLI to trigger test webhooks
   - Verify user status updates in database
   - Check push notifications sent

### Test Stripe Identity (Test Mode):
- Use test documents provided by Stripe
- Test successful verification
- Test failed verification
- Test cancellation

---

## 🔔 SOCKET NOTIFICATIONS

The system sends real-time socket notifications:

```javascript
// Verification completed
socket.on('verificationStatusChanged', (data) => {
  // data.status = 'verified'
  // data.message = 'Your identity has been verified...'
});
```

---

## 🚨 ERROR HANDLING

### Common Errors:

1. **Payment Failed:**
```json
{
  "message": "Payment failed for verification fee",
  "error_code": "payment_failed",
  "payment_status": "requires_payment_method"
}
```

2. **Already Verified:**
```json
{
  "message": "User is already verified",
  "verification_status": "verified",
  "already_verified": true
}
```

3. **Verification Required:**
```json
{
  "message": "Identity verification required to rent equipment",
  "error_code": "verification_required",
  "require_verification": true
}
```

---

## 📊 ADMIN CONFIGURATION

Admin can update verification settings:

```http
PUT /admin/settings
Authorization: Bearer {admin_token}

{
  "verification_fee": 2.50,
  "verification_title": "Verify Your Identity",
  "verification_description": "Custom description here..."
}
```

---

## ✅ BENEFITS OF THIS IMPLEMENTATION

1. **Backend-Driven:** All logic in backend, frontend just displays UI
2. **Webhook-Based:** No polling needed, instant status updates
3. **One-Time Fee:** Automatic $2 charge before verification
4. **Configurable:** Admin can change fee, title, description
5. **Audit Trail:** Complete history of verification attempts
6. **Secure:** Stripe handles sensitive ID verification
7. **Real-time:** Socket notifications for status changes

---

## 🔐 SECURITY NOTES

1. Webhook signature verification prevents tampering
2. Payment charged before session creation prevents free attempts
3. Status stored in database, not reliant on client
4. JWT authentication required for all endpoints
5. Admin-only access to verification history

---

## 📞 SUPPORT

If users have verification issues:
1. Check verification history in admin panel
2. View Stripe dashboard for session details
3. Check webhook delivery in Stripe
4. Contact Stripe support if needed

---

**Implementation Date:** January 2025
**Version:** 1.0.0




