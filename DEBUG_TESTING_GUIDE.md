# 🔍 Stripe Connect Onboarding - Debug Testing Guide

## ✅ Setup Complete

1. **Seller Account Reset**: The seller has been reset and is ready for fresh onboarding
2. **Backend Debugging Enabled**: Extensive logging added to all critical points
3. **Code Deployed**: Latest changes pushed to GitHub (commit 6fd26d5)

---

## 📋 Testing Steps

### Step 1: Deploy Latest Code to Live Server
```bash
# SSH into your Azure server
cd /path/to/opeec
git pull origin main
pm2 restart all  # or your restart command
```

### Step 2: Start Monitoring Logs
```bash
# In terminal, monitor the backend logs
pm2 logs  # or your log viewing command

# You should see these debug sections:
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🔵 CREATE STRIPE CONNECT ACCOUNT REQUEST
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 3: Test the Onboarding Flow in App

1. **Close app completely** (kill from recent apps)

2. **Login as SELLER**:
   - Email: `seller.test@opeec.app`
   - Password: `Test@123`

3. **Navigate to Wallet**:
   - Go to Profile → Wallet
   - Tap "Connect Bank Account"

4. **Watch the Logs**: You should see:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔵 CREATE STRIPE CONNECT ACCOUNT REQUEST
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📋 User ID: [seller_id]
   📋 Email: seller.test@opeec.app
   📋 Current Account ID: NONE
   📋 Current Status: NONE
   📋 Onboarding Completed: false
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

5. **Account Creation**: You should see:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ✅ STRIPE ACCOUNT CREATED
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Account ID: acct_XXXXXXXXXX
   Type: express
   Country: US
   Email: seller.test@opeec.app
   Capabilities: {...}
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

6. **Link Creation**: You should see:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ✅ ONBOARDING LINK CREATED
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   URL: https://connect.stripe.com/setup/...
   Created: 2025-11-28T21:XX:XX.XXXZ
   Expires: 2025-11-28T21:XX:XX.XXXZ (5 min)
   Refresh URL: https://opeec.azurewebsites.net/stripe-connect/refresh
   Return URL: https://opeec.azurewebsites.net/stripe-connect/success
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

7. **WebView Opens**: The Stripe onboarding form should load

8. **Fill Phone Number**: 
   - Use test phone number button
   - OR enter any phone like: +1 506 234 5678

9. **Click Submit**: This is where the HTTP 400 error occurs

10. **Watch for Redirect**: If successful, you should see either:
    - **Success**: 
    ```
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ✅ STRIPE CONNECT ONBOARDING SUCCESS REDIRECT
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Time: 2025-11-28T21:XX:XX.XXXZ
    URL: /stripe-connect/success
    Query Params: {...}
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ```
    - **Refresh/Retry**:
    ```
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    🔄 STRIPE CONNECT ONBOARDING REFRESH/RETRY REDIRECT
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Time: 2025-11-28T21:XX:XX.XXXZ
    URL: /stripe-connect/refresh
    Query Params: {...}
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ```

11. **Webhook (if onboarding completes)**:
    ```
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    📨 STRIPE WEBHOOK RECEIVED: account.updated
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Event ID: evt_XXXXXXXXXX
    Created: 2025-11-28T21:XX:XX.XXXZ
    Type: account.updated
    Object ID: acct_XXXXXXXXXX
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ```

---

## 📸 What I Need From You

Please copy and send me **ALL** of the following:

### 1. Backend Terminal Logs
```
# Everything from the moment you tap "Connect Bank Account"
# Until the HTTP 400 error appears
# Include ALL the debug boxes with ━━━ borders
```

### 2. App Terminal Logs (Flutter)
```
# Look for these key logs:
[log] 💳 Creating Stripe Connect account...
[log] response: {...}
[log] Loading Stripe WebView URL: ...
[log] WebView page started: ...
[log] WebView page finished: ...
[log] Checking URL for callbacks: ...
[log] WebView HTTP Error: 400
```

### 3. Screenshots
- Screenshot of the Stripe onboarding form (before submitting)
- Screenshot of the HTTP 400 error
- Screenshot of the WebView error page

### 4. Exact Timing
- What was the last thing you saw before the error?
- Did the form submit and then show 400?
- Or did it show 400 immediately?

---

## 🎯 What We're Looking For

The debugging will help us identify:

1. **Account Creation**: Is the Stripe account being created correctly?
2. **Link Generation**: Is the onboarding URL valid?
3. **URL Structure**: What exact URL is Stripe trying to load when it fails?
4. **Redirect Behavior**: Is Stripe trying to redirect somewhere and failing?
5. **Webhook Events**: Are we receiving any webhooks from Stripe?

---

## ⚠️ Known Issues to Check

- **Rate Limiting**: If you see "429" errors, Stripe is rate-limiting (wait 1-2 minutes)
- **Link Expiration**: Links expire in 5 minutes - if you wait too long, regenerate
- **Cleartext HTTP**: Android blocks HTTP (localhost) - but our redirects use HTTPS
- **Account Permissions**: The Stripe account might need specific capabilities

---

## 🚀 Ready to Test!

Once you've deployed the latest code and started monitoring logs:
1. Follow the steps above
2. Capture ALL the logs
3. Send them to me
4. I'll analyze and provide the exact fix!

Let me know when you're ready to start! 📋

