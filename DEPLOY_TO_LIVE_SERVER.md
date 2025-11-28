# 🚀 Deploy Payment System to Live Server (Azure)

**Target Server:** https://opeec.azurewebsites.net

---

## ⚠️ CRITICAL: Live Server Needs Updates

Your Flutter app is currently pointing to the **production server** (`https://opeec.azurewebsites.net`), but the live server doesn't have:
- ✅ Payment controller code
- ✅ Stripe API keys configured
- ✅ Seller Stripe Connect account setup
- ✅ Updated order model with stripe_payment field

---

## 📋 DEPLOYMENT CHECKLIST

### **Option 1: Deploy to Live Server** (Recommended for production testing)

#### **Step 1: Deploy Latest Backend Code**
```bash
# From your local machine
cd "/Users/apple/Development/Backend Projects/opeec"

# Ensure all code is committed
git status
git add .
git commit -m "feat: Payment system ready for deployment"
git push origin main
```

#### **Step 2: Azure Deployment**
If using Azure DevOps / GitHub Actions:
- Push triggers automatic deployment
- Wait for deployment to complete (~5 minutes)
- Check deployment logs for errors

If using manual deployment:
```bash
# Deploy via Azure CLI
az webapp deployment source sync --name opeec --resource-group <your-resource-group>
```

#### **Step 3: Configure Stripe Keys on Live Server**

**Option A: Via MongoDB Atlas (if using cloud database)**
```javascript
// Connect to your production MongoDB
// Update stripeKeys collection:
{
  "publishableKey": "pk_test_YOUR_PUBLISHABLE_KEY_HERE",
  "secretKey": "sk_test_YOUR_SECRET_KEY_HERE"
}
// Use the Stripe keys you received from your Stripe account
```

**Option B: Via Azure Console**
1. Go to Azure Portal → Your App Service
2. Configuration → Application Settings
3. Add/Update:
   ```
   STRIPE_PUBLISHABLE_KEY = pk_test_YOUR_KEY_HERE
   STRIPE_SECRET_KEY = sk_test_YOUR_KEY_HERE
   ```
   (Use your actual Stripe test keys from your Stripe Dashboard)

#### **Step 4: Setup Seller Stripe Connect on Live Server**

**Option A: Use Postman (Easiest)**
```bash
# Import OPEEC_Complete_API_Collection.postman_collection.json
# Update base URL to: https://opeec.azurewebsites.net
# Run: "Stripe Connect" → "Create Account" (as seller)
# Complete onboarding in returned URL
```

**Option B: Via Database (Quick fix for testing)**
```javascript
// In your production MongoDB, update seller user:
db.users.updateOne(
  { email: "seller.test@opeec.app" },
  {
    $set: {
      "stripe_connect.account_id": "acct_test_1764364286225",
      "stripe_connect.account_status": "active",
      "stripe_connect.onboarding_completed": true,
      "stripe_connect.charges_enabled": true,
      "stripe_connect.payouts_enabled": true,
      "stripe_connect.details_submitted": true
    }
  }
)
```

#### **Step 5: Verify Live Server**
```bash
# Test backend is running
curl https://opeec.azurewebsites.net/health

# Test Stripe keys configured
curl https://opeec.azurewebsites.net/stripe/get

# Test seller can receive payments (use Postman)
POST https://opeec.azurewebsites.net/payment/create-intent
Headers: Authorization: Bearer <seller_token>
Body: {
  "equipment_id": "6929fd7a243979ce15e1cb21",
  "total_amount": 596.64,
  "platform_fee": 48.00,
  "rental_fee": 450.00,
  "owner_id": "6929fd79243979ce15e1cb08"
}
```

---

### **Option 2: Test Locally First** (Faster for immediate testing)

#### **Step 1: Change Flutter App to Development Mode**
```dart
// lib/controller/utils/config/app_config.dart
static const int _isProduction = 0; // Change from 1 to 0
```

#### **Step 2: Update Development URL**
```dart
// lib/controller/utils/config/app_config.dart
static const String _developmentApiUrl = "http://YOUR_LOCAL_IP:5001";

// Find your local IP:
// Mac: ifconfig | grep "inet " | grep -v 127.0.0.1
// Windows: ipconfig
// Example: "http://192.168.1.100:5001"
```

#### **Step 3: Start Local Backend**
```bash
cd "/Users/apple/Development/Backend Projects/opeec"
npm run dev
```

#### **Step 4: Rebuild Flutter App**
```bash
cd "/Users/apple/Development/Flutter Projects/Flutter Apps/opeec_app"
flutter clean
flutter pub get
flutter run
```

**Now test locally with all the fixes!**

---

## 🔍 **HOW TO CHECK WHAT'S WRONG**

### **Check Live Server Backend Version**
```bash
# Check if payment routes exist
curl https://opeec.azurewebsites.net/payment/create-intent

# Expected: 401 Unauthorized (route exists, needs auth)
# If 404: Backend doesn't have payment routes yet
```

### **Check Live Server Logs (Azure)**
1. Azure Portal → Your App Service
2. Monitoring → Log stream
3. Look for errors when you try to pay

### **Check Database Stripe Keys**
```javascript
// MongoDB Atlas or Azure Cosmos DB
db.stripekeys.findOne()

// Should return:
{
  "publishableKey": "pk_test_...",
  "secretKey": "sk_test_..."
}
```

---

## 💡 **RECOMMENDATION**

**For immediate testing:** Use **Option 2** (test locally)
- Faster setup (no deployment wait time)
- All fixes are already on your local machine
- Stripe keys and seller account already configured locally
- Can debug easily

**For production deployment:** Use **Option 1** after local testing succeeds
- Deploy only after confirming everything works locally
- Follow deployment checklist step by step
- Configure live server properly

---

## 📞 **QUICK FIX FOR NOW**

**To test payments immediately:**

1. **Switch to development mode:**
   ```dart
   // app_config.dart line 9
   static const int _isProduction = 0; // Change this
   ```

2. **Update development URL to your machine's IP:**
   ```dart
   // app_config.dart line 20
   static const String _developmentApiUrl = "http://YOUR_IP:5001";
   ```

3. **Start local backend:**
   ```bash
   npm run dev
   ```

4. **Hot reload or restart Flutter app**

5. **Try payment again - should work!**

---

## ✅ **SUCCESS INDICATORS**

**Local Backend Working:**
```
✅ Server running on port 5001
✅ MongoDB Connected Successfully
✅ Order monitoring started
```

**Payment Flow Working:**
```
✅ "Pay Now" → Stripe payment sheet appears
✅ Enter test card → Payment succeeds
✅ Order created → Confirmation shown
✅ Seller sees order in dashboard
```

---

**Choose your path and let me know which option you prefer!** 🚀

