# Stripe Connect Environment Setup Guide

**Date:** October 27, 2025  
**Feature:** Stripe Connect Automated Payouts

---

## 🔐 Required Environment Variables

Add these new environment variables to your `.env` file:

```bash
# ============================================
# STRIPE CONNECT CONFIGURATION
# ============================================

# Stripe Secret Key (you already have this)
STRIPE_SECRET_KEY=sk_test_51xxxxx_test_xxxxx  # Use sk_live_xxx for production

# Stripe Connect Webhook Secret (NEW - Required)
# Get this from: Stripe Dashboard → Developers → Webhooks → Add endpoint
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx

# Frontend URL for Stripe onboarding redirects (NEW - Required)
FRONTEND_URL=https://opeec.com  # Production
# FRONTEND_URL=http://localhost:3000  # Development
```

---

## 🚀 Setup Instructions

### **Step 1: Enable Stripe Connect in Your Stripe Account**

1. **Log in to Stripe Dashboard:**
   - Go to: https://dashboard.stripe.com

2. **Enable Connect Platform:**
   - Navigate to: **Settings → Connect → Get Started**
   - Select account type: **Platform or Marketplace**
   - Fill out platform details:
     - Platform name: `OPEEC`
     - Business description: `Equipment rental marketplace`
     - Website: `https://opeec.com`

3. **Save and Continue**

---

### **Step 2: Get Your Stripe Secret Key**

**You probably already have this**, but if not:

1. **Navigate to:** Developers → API Keys
2. **Copy the Secret Key:**
   - **Test Mode:** `sk_test_51xxxxx...`
   - **Live Mode:** `sk_live_51xxxxx...`

3. **Add to `.env`:**
```bash
STRIPE_SECRET_KEY=sk_test_51xxxxx...  # Use test key for development
```

⚠️ **Important:** Never commit this key to version control!

---

### **Step 3: Create Stripe Connect Webhook**

**This is NEW and REQUIRED for transfer status updates:**

1. **Navigate to:** Developers → Webhooks

2. **Click "Add Endpoint"**

3. **Enter Endpoint URL:**
   - **Production:** `https://api.opeec.com/webhooks/stripe-connect`
   - **Development:** Use Stripe CLI (see below)

4. **Select Events to Listen To:**

Select these events:
```
✓ account.updated
✓ account.application.authorized
✓ account.application.deauthorized
✓ transfer.created
✓ transfer.paid
✓ transfer.failed
✓ transfer.reversed
✓ payout.paid
✓ payout.failed
```

5. **Click "Add Endpoint"**

6. **Copy Webhook Signing Secret:**
   - After creating, click on the endpoint
   - Click "Reveal" on the "Signing secret"
   - Copy the secret (starts with `whsec_`)

7. **Add to `.env`:**
```bash
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

---

### **Step 4: Set Frontend URL**

**Used for redirect URLs after Stripe onboarding:**

```bash
# Production
FRONTEND_URL=https://opeec.com

# Development
FRONTEND_URL=http://localhost:3000
```

**What this does:**
- After owner completes Stripe onboarding, Stripe redirects to:
  - Success: `${FRONTEND_URL}/stripe-connect/success`
  - Refresh: `${FRONTEND_URL}/stripe-connect/refresh`

**Mobile App Must Handle These Routes:**
- `/stripe-connect/success` → Show success message, update account status
- `/stripe-connect/refresh` → Regenerate onboarding link

---

## 🧪 Testing with Stripe CLI (Development Only)

**For local development**, use Stripe CLI to forward webhooks:

### **Install Stripe CLI:**

**macOS:**
```bash
brew install stripe/stripe-cli/stripe
```

**Windows:**
```powershell
scoop install stripe
```

**Linux:**
```bash
wget https://github.com/stripe/stripe-cli/releases/download/v1.17.0/stripe_1.17.0_linux_x86_64.tar.gz
tar -xvf stripe_1.17.0_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin
```

### **Login to Stripe:**
```bash
stripe login
```

### **Forward Webhooks to Localhost:**
```bash
stripe listen --forward-to localhost:5001/webhooks/stripe-connect
```

**Output will show:**
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxx
```

**Copy that secret to `.env`:**
```bash
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

**Keep Stripe CLI running** while testing locally.

---

## 🧪 Test Mode vs Live Mode

### **Test Mode (Development):**

**Stripe Keys:**
```bash
STRIPE_SECRET_KEY=sk_test_51xxxxx...
```

**Test Stripe Connect Accounts:**
- Use test account details from Stripe docs
- Test bank account: `000123456789` (US)
- Test routing number: `110000000`
- All transfers happen instantly in test mode

**Test Webhooks:**
- Use Stripe CLI for local development
- Or create test webhook endpoint on staging server

---

### **Live Mode (Production):**

**Stripe Keys:**
```bash
STRIPE_SECRET_KEY=sk_live_51xxxxx...
```

**Real Stripe Connect Accounts:**
- Owners must provide real bank details
- Stripe performs actual KYC verification
- Transfers take 2-7 business days

**Production Webhooks:**
- Must use public HTTPS endpoint
- Create webhook endpoint in Stripe dashboard (live mode)

**⚠️ Important:**
- Test thoroughly in test mode before going live
- Have backup payment methods ready
- Monitor failed transfers closely in first week

---

## 🔍 Verify Setup

### **1. Check Environment Variables:**

Create a test script `test-env.js`:

```javascript
require('dotenv').config();

console.log('✅ Environment Variables Check:');
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✓ Set' : '✗ Missing');
console.log('STRIPE_CONNECT_WEBHOOK_SECRET:', process.env.STRIPE_CONNECT_WEBHOOK_SECRET ? '✓ Set' : '✗ Missing');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL || '✗ Missing');
```

Run: `node test-env.js`

---

### **2. Test Stripe Connection:**

```bash
curl https://api.stripe.com/v1/accounts \
  -u sk_test_51xxxxx:
```

Should return: `{ "object": "list", ... }`

---

### **3. Test Webhook Endpoint:**

**Start your server:**
```bash
npm start
```

**Trigger test webhook:**
```bash
stripe trigger transfer.paid
```

**Check console logs** for:
```
📨 Stripe webhook received: transfer.paid
✅ Transfer paid: tr_xxxxx - $90.00
```

---

## 📁 Complete `.env` Example

```bash
# ============================================
# SERVER CONFIGURATION
# ============================================
PORT=5001
NODE_ENV=development  # production for live

# ============================================
# DATABASE
# ============================================
MONGODB_URI=mongodb://localhost:27017/opeec
# Or MongoDB Atlas:
# MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/opeec

# ============================================
# JWT
# ============================================
JWT_SECRET=your_jwt_secret_key_here

# ============================================
# STRIPE (EXISTING)
# ============================================
STRIPE_SECRET_KEY=sk_test_51xxxxx...
STRIPE_PUBLISHABLE_KEY=pk_test_51xxxxx...

# ============================================
# STRIPE CONNECT (NEW)
# ============================================
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
FRONTEND_URL=https://opeec.com

# ============================================
# EMAIL (EXISTING)
# ============================================
EMAIL=support@opeec.com
EMAIL_PASSWORD=your_email_password

# ============================================
# AZURE BLOB STORAGE (EXISTING)
# ============================================
AZURE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...

# ============================================
# FIREBASE (EXISTING)
# ============================================
FIREBASE_PROJECT_ID=opeec-xxxxx
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nxxxx...
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@opeec-xxxxx.iam.gserviceaccount.com

# ============================================
# TIMING CONFIGURATION (EXISTING)
# ============================================
TIME_OFFSET_HOURS=3
INTERVAL_MINUTES=1
DAILY_PENALTY=50
```

---

## 🚨 Security Best Practices

### **1. Never Commit Secrets:**

Add to `.gitignore`:
```
.env
.env.local
.env.production
*.pem
serviceAccount.json
```

### **2. Rotate Keys Regularly:**
- Rotate webhook secrets every 90 days
- Rotate API keys if compromised

### **3. Use Environment-Specific Keys:**
- Development: Use test keys
- Staging: Use test keys (separate webhook)
- Production: Use live keys

### **4. Restrict API Key Permissions:**
- Stripe Dashboard → API Keys → Restricted Keys
- Only enable required permissions

---

## 🔧 Troubleshooting

### **Problem: Webhook Not Receiving Events**

**Check:**
1. Is Stripe CLI running? (`stripe listen --forward-to ...`)
2. Is webhook endpoint registered in Stripe dashboard?
3. Is `STRIPE_CONNECT_WEBHOOK_SECRET` correct?
4. Is server running and accessible?

**Test:**
```bash
curl -X POST http://localhost:5001/webhooks/stripe-connect \
  -H "Content-Type: application/json" \
  -d '{"type":"transfer.paid"}'
```

Should return: `{"received":true}`

---

### **Problem: Signature Verification Failed**

**Error:** `Webhook signature verification failed`

**Solution:**
1. Check `STRIPE_CONNECT_WEBHOOK_SECRET` matches Stripe dashboard
2. Ensure webhook route uses `express.raw()` (already done in code)
3. Regenerate webhook secret if needed

---

### **Problem: Transfer Creation Fails**

**Error:** `Owner does not have a Stripe Connect account`

**Solution:**
- Ensure owner completed Stripe onboarding
- Check `user.stripe_connect.payouts_enabled === true`
- Verify Stripe account ID exists

---

### **Problem: Onboarding Link Expired**

**Error:** `The link has expired`

**Solution:**
- Call `POST /stripe-connect/refresh-onboarding` to get new link
- Onboarding links expire after 24 hours

---

## 📊 Monitoring

### **Check Stripe Dashboard:**

**Connect → Accounts:**
- View all connected owners
- Check account statuses
- See verification requirements

**Connect → Transfers:**
- View all transfers
- Check failed transfers
- See payout timing

**Developers → Webhooks:**
- View webhook delivery attempts
- Check failed webhook events
- See event logs

---

## 🚀 Deployment Checklist

### **Before Production Launch:**

- [ ] Switch from test keys to live keys
- [ ] Create production webhook endpoint
- [ ] Update `FRONTEND_URL` to production domain
- [ ] Test onboarding flow end-to-end
- [ ] Test transfer creation and completion
- [ ] Verify webhook events are received
- [ ] Set up monitoring/alerts for failed transfers
- [ ] Document rollback procedure
- [ ] Train support team on new system

### **After Launch:**

- [ ] Monitor first 10 transfers closely
- [ ] Check webhook delivery success rate
- [ ] Verify owners receive money in banks
- [ ] Collect user feedback
- [ ] Monitor Stripe Connect dashboard daily

---

## 📞 Support

### **Stripe Support:**
- Email: support@stripe.com
- Docs: https://stripe.com/docs/connect
- Status: https://status.stripe.com

### **Internal Team:**
- Backend Issues: Contact backend team
- Mobile App Issues: Contact mobile team
- Admin Panel Issues: Contact frontend team

---

## ✅ Summary

**What You Need:**
1. ✅ `STRIPE_SECRET_KEY` (probably already have)
2. ✅ `STRIPE_CONNECT_WEBHOOK_SECRET` (NEW - from Stripe dashboard)
3. ✅ `FRONTEND_URL` (NEW - your app's URL)

**Setup Time:** 15-30 minutes

**Testing Time:** 1-2 hours

**Production Deployment:** Coordinate with mobile/admin teams

---

**Ready to proceed?**  
Make sure all environment variables are set, then restart your server:
```bash
npm restart
```

Check console logs for:
```
✅ Server running on port 5001
✅ MongoDB connected
✅ Stripe initialized
```

Good luck! 🚀

