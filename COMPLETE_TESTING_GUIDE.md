# 🎯 COMPLETE OPEEC TESTING GUIDE
**Payment Integration Testing - Step by Step**

---

## 📋 **QUICK START**

### **Test Credentials (Ready to Use)**

#### **Android Phone 1 - SELLER**
```
Email:     seller.test@opeec.app
Password:  Seller123!
User ID:   6929fd79243979ce15e1cb08
Token:     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTI5ZmQ3OTI0Mzk3OWNlMTVlMWNiMDgiLCJpYXQiOjE3NjQzNTk1NDV9.vFcxwh0jjj0q61qAJsah8pmdBvtL3kuYGVeXmFN8__k

Equipment Owned:
  • Caterpillar 320 Excavator ($150/day)
  • Bobcat S570 Skid Steer ($100/day)
```

#### **Android Phone 2 - BUYER**
```
Email:     buyer.test@opeec.app
Password:  Buyer123!
User ID:   6929fd79243979ce15e1cb0a
Token:     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTI5ZmQ3OTI0Mzk3OWNlMTVlMWNiMGEiLCJpYXQiOjE3NjQzNTk1NDZ9.yhk_H0Q5ZgocDNWUyobb8c3jV0C_M2Rzc2guPa1uksM
```

#### **Stripe Test Card**
```
Card Number:  4242 4242 4242 4242
Expiry:       12/25 (any future date)
CVC:          123 (any 3 digits)
ZIP:          12345 (any 5 digits)
```

---

## 🎬 **TESTING SEQUENCE**

### **PHASE 1: Postman API Testing (15 minutes)**

#### **Step 1: Import Collection**
1. Open Postman
2. Click "Import"
3. Select file: `OPEEC_Complete_API_Collection.postman_collection.json`
4. Collection imports with pre-configured tokens

#### **Step 2: Test Authentication**
```
Run: "1. User Authentication" → "Login Seller"
Expected: ✅ 200 OK, token returned

Run: "1. User Authentication" → "Login Buyer"
Expected: ✅ 200 OK, token returned
```

#### **Step 3: Test Equipment Listing**
```
Run: "5. Equipment Management" → "Get All Equipment"
Expected: ✅ 200 OK, 2 equipment items visible
  • Caterpillar 320 Excavator
  • Bobcat S570 Skid Steer
```

#### **Step 4: Test Payment Flow (NEW)**
```
Run: "7. Payment Flow" → "Create Payment Intent"
Expected: ✅ 200 OK
Response:
{
  "success": true,
  "payment_intent_id": "pi_xxxxx",
  "client_secret": "pi_xxxxx_secret_xxxxx",
  "amount": 127.59
}

Note: payment_intent_id is auto-saved to collection variable
```

#### **Step 5: Test Order Creation**
```
Run: "8. Order Management" → "Create Order (With Payment)"
Expected: ✅ 201 Created
Response:
{
  "message": "Order created successfully.",
  "data": {
    "_id": "order_id",
    "stripe_payment": {
      "payment_intent_id": "pi_xxxxx",
      "payment_status": "succeeded"
    }
  }
}

Note: order_id is auto-saved to collection variable
```

#### **Step 6: Test Order Lifecycle**
```
1. Run: "8. Order Management" → "Deliver Order" (Seller)
   Expected: ✅ 200 OK, status → Delivered

2. Run: "8. Order Management" → "Collect Order" (Buyer)
   Expected: ✅ 200 OK, status → Ongoing

3. Run: "8. Order Management" → "Return Order" (Buyer)
   Expected: ✅ 200 OK, status → Returned

4. Run: "8. Order Management" → "Finish Order" (Seller)
   Expected: ✅ 200 OK, status → Finished
   Note: Triggers automatic payout to seller
```

#### **Step 7: Test Cancellation & Refund**
```
Create new order, then:
Run: "8. Order Management" → "Cancel Order"
Expected: ✅ 200 OK
Response:
{
  "message": "Order canceled successfully.",
  "rental_status": "Cancelled",
  "refund_processed": true,
  "refund_amount": 127.59
}
```

**✅ Postman Testing Complete**

---

### **PHASE 2: Android App Testing (30 minutes)**

#### **Pre-Testing Setup**
1. ✅ Backend server running (`npm start`)
2. ✅ Two Android phones available
3. ✅ OPEEC app installed on both phones
4. ✅ Phones can reach backend server

---

#### **PHONE 1: SELLER SETUP**

**Screen 1: Login**
```
1. Open OPEEC app
2. Tap "Login" (not signup)
3. Enter:
   Email:    seller.test@opeec.app
   Password: Seller123!
4. Tap "Login"
Expected: ✅ Login successful, redirect to home
```

**Screen 2: Verify Profile**
```
1. Tap "Profile" icon
2. Check profile details:
   ✅ Name: John Seller
   ✅ Email: seller.test@opeec.app
   ✅ Verification Status: Verified ✓
   ✅ Stripe Connect: Active (if shown)
```

**Screen 3: Check Equipment**
```
1. Tap "My Equipment" or "Seller Dashboard"
2. Verify equipment visible:
   ✅ Caterpillar 320 Excavator ($150/day)
   ✅ Bobcat S570 Skid Steer ($100/day)
3. Tap on Excavator → View details
   ✅ All details visible
   ✅ Status: Active/Available
```

**Screen 4: Wait for Order**
```
1. Keep app open or ensure notifications enabled
2. Navigate to "Orders" or "Bookings" tab
3. Should show "No orders yet"
4. WAIT for buyer to place order
```

---

#### **PHONE 2: BUYER FLOW (Complete Rental)**

**Screen 1: Login**
```
1. Open OPEEC app
2. Tap "Login"
3. Enter:
   Email:    buyer.test@opeec.app
   Password: Buyer123!
4. Tap "Login"
Expected: ✅ Login successful, redirect to home
```

**Screen 2: Browse Equipment**
```
1. On home screen, see equipment list
   OR tap "Browse" / "Search"
2. Find: "Caterpillar 320 Excavator"
   (May need to scroll or search)
3. Tap on the equipment card
Expected: ✅ Equipment details screen opens
```

**Screen 3: Equipment Details**
```
View:
✅ Equipment photos
✅ Name: Caterpillar 320 Excavator
✅ Price: $150/day
✅ Owner: John Seller
✅ Location
✅ Description
✅ "Book Now" or "Rent" button visible
```

**Screen 4: Select Dates**
```
1. Tap "Book Now" or "Rent"
2. Select dates:
   Start Date: Tomorrow
   End Date:   Day after tomorrow (2 days)
3. Review pricing:
   ✅ Rental Fee: $150 × 2 days = $300
   ✅ Platform Fee: (calculated)
   ✅ Tax: (calculated)
   ✅ Security: Insurance or Deposit option
4. Select security option (Insurance or Deposit)
5. Tap "Continue" or "Next"
```

**Screen 5: Delivery Address**
```
1. Enter or select delivery address:
   "456 Buyer Ave, Test City"
2. Or select "My Location"
3. Verify address shows on map
4. Tap "Continue" or "Next"
```

**Screen 6: Payment Review**
```
Review screen shows:
✅ Equipment: Caterpillar 320 Excavator
✅ Dates: [Selected dates]
✅ Delivery Address: [Your address]
✅ Pricing Breakdown:
   - Rental Fee: $300
   - Platform Fee: $30
   - Tax: $42.9
   - Insurance/Deposit: (amount)
   - TOTAL: $xxx.xx
✅ "Pay Now" button
```

**Screen 7: PAYMENT (CRITICAL TEST)**
```
1. Tap "Pay Now"
2. Loading indicator appears
3. Stripe Payment Sheet opens (white bottom sheet)

Expected Stripe Sheet:
✅ Shows total amount
✅ "Add card" or card input fields visible
✅ Can enter card details

4. Enter test card:
   Card:   4242 4242 4242 4242
   Expiry: 12/25
   CVC:    123
   ZIP:    12345

5. Tap "Pay" or "Confirm"
6. Processing animation
7. Success message appears
8. Returns to app

Expected: ✅ "Payment successful! Booking confirmed"
```

**Screen 8: Order Confirmation**
```
✅ Success screen or message shown
✅ "View Order" or auto-redirect to orders
✅ Order appears in "My Rentals" or "Current Orders"
✅ Status: "Booked" or "Pending Delivery"
```

**CRITICAL CHECK:**
If payment fails or Stripe sheet doesn't appear:
- Check backend logs for errors
- Verify Stripe keys in app config
- Verify seller has equipment approved
- Try again or check Postman first

---

#### **PHONE 1: SELLER - DELIVER ORDER**

**Screen 1: Check New Order**
```
1. App shows notification OR
2. Go to "Orders" / "Seller Dashboard"
3. See new order in "Booked" tab
Expected: ✅ New order visible
   Equipment: Caterpillar 320 Excavator
   Customer: Sarah Buyer
   Dates: [Selected dates]
   Status: Booked
```

**Screen 2: View Order Details**
```
1. Tap on the order
2. View full details:
   ✅ Customer info
   ✅ Delivery address
   ✅ Rental dates
   ✅ Total amount
   ✅ "Deliver" button visible
```

**Screen 3: Deliver Equipment**
```
1. Tap "Deliver" button
2. May prompt to take photos:
   - Tap "Take Photo" or "Upload"
   - Take/select 1-3 photos of equipment
3. Tap "Confirm Delivery"
4. Processing...
5. Success message

Expected: ✅ "Equipment delivered successfully"
Status changes: Booked → Delivered
```

---

#### **PHONE 2: BUYER - COLLECT EQUIPMENT**

**Screen 1: Check Order Status**
```
1. Refresh orders list or check notification
2. Order status should be: "Delivered"
3. Tap on the order
Expected: ✅ Status updated
   ✅ Delivery photos visible (from seller)
   ✅ "Collect" button visible
```

**Screen 2: Collect Equipment**
```
1. Tap "Collect" or "Confirm Collection"
2. May prompt confirmation
3. Tap "Yes" or "Confirm"
4. Processing...
5. Success message

Expected: ✅ "Equipment collected successfully"
Status changes: Delivered → Ongoing
```

---

#### **PHONE 2: BUYER - RETURN EQUIPMENT**

**Screen 1: Return Equipment**
```
Wait appropriate time or proceed immediately for testing

1. Go to order details
2. Status: "Ongoing"
3. Tap "Return" button
4. May prompt to take photos:
   - Take/select return photos
5. Tap "Confirm Return"
6. Processing...
7. Success message

Expected: ✅ "Equipment returned successfully"
Status changes: Ongoing → Returned
```

---

#### **PHONE 1: SELLER - FINISH ORDER**

**Screen 1: Complete Order**
```
1. Check order - Status: "Returned"
2. View return photos from buyer
3. Tap "Finish" or "Complete Order"
4. May prompt to rate/review
5. Confirm completion
6. Processing...
7. Success message

Expected: ✅ "Order completed successfully"
Status changes: Returned → Finished
✅ Automatic payout triggered to seller
✅ May show payout information
```

---

### **PHASE 3: Test Cancellation & Refund**

#### **Create New Order (Phone 2 - Buyer)**
```
Repeat steps from Screen 1-7 to create another order
```

#### **Cancel Order (Phone 1 - Seller)**
```
1. Go to new order (Status: Booked)
2. Tap on order details
3. Look for "Cancel" button or menu (•••)
4. Tap "Cancel Order"
5. Enter reason: "Equipment needs maintenance"
6. Confirm cancellation
7. Processing...

Expected: ✅ "Order cancelled successfully"
✅ "Refund processed: $xxx.xx"
Status: Cancelled
```

#### **Verify Refund (Phone 2 - Buyer)**
```
1. Check cancelled order
2. Should show:
   ✅ Status: Cancelled
   ✅ Refund: $xxx.xx (Processed)
   ✅ Reason: Equipment needs maintenance
```

---

## 📊 **VERIFICATION CHECKLIST**

### **Backend (Postman)**
- [ ] ✅ Login works for both users
- [ ] ✅ Equipment visible in API
- [ ] ✅ Payment intent created successfully
- [ ] ✅ Order created with payment_intent_id
- [ ] ✅ Order lifecycle (Deliver→Collect→Return→Finish) works
- [ ] ✅ Cancellation triggers refund
- [ ] ✅ Refund amount recorded correctly

### **Android App - Seller**
- [ ] ✅ Login successful
- [ ] ✅ Profile shows verified status
- [ ] ✅ Equipment visible (2 items)
- [ ] ✅ New orders appear
- [ ] ✅ Can deliver order with photos
- [ ] ✅ Can finish order
- [ ] ✅ Can cancel order

### **Android App - Buyer**
- [ ] ✅ Login successful
- [ ] ✅ Can browse equipment
- [ ] ✅ Equipment details load
- [ ] ✅ Date selection works
- [ ] ✅ Pricing calculated correctly
- [ ] ✅ **Stripe payment sheet appears**
- [ ] ✅ **Payment processes successfully**
- [ ] ✅ Order confirmation shown
- [ ] ✅ Can collect equipment
- [ ] ✅ Can return equipment
- [ ] ✅ Cancellation shows refund

### **Payment Integration (Critical)**
- [ ] ✅ Stripe sheet opens on "Pay Now"
- [ ] ✅ Test card accepted
- [ ] ✅ Payment success message shown
- [ ] ✅ Order created after payment
- [ ] ✅ Payment_intent_id stored in order
- [ ] ✅ Refunds process on cancellation
- [ ] ✅ No errors in backend logs

---

## 🚨 **TROUBLESHOOTING**

### **Issue 1: Stripe Sheet Doesn't Appear**

**Symptoms:**
- Tap "Pay Now" → Nothing happens
- OR error message appears
- OR app crashes

**Solutions:**
1. Check Flutter app compilation:
   ```bash
   cd "/Users/apple/Development/Flutter Projects/Flutter Apps/opeec_app"
   flutter clean
   flutter pub get
   flutter run
   ```

2. Verify Stripe keys in app configuration

3. Check backend logs for payment intent errors

4. Try Postman first to verify backend API works

---

### **Issue 2: Payment Intent Creation Fails**

**Symptoms:**
- API returns 400/500 error
- "Owner not onboarded" message

**Solutions:**
1. Check seller Stripe Connect status:
   ```
   Postman: "3. Stripe Connect" → "Check Connect Status"
   Should return: "account_status": "active"
   ```

2. If not active, seller needs Stripe Connect onboarding

---

### **Issue 3: Order Creation Fails**

**Symptoms:**
- "Payment not completed" error
- Order not created

**Solutions:**
1. Verify payment_intent_id exists
2. Check if payment was actually processed
3. Try creating order WITHOUT payment_intent_id (backward compatible)

---

### **Issue 4: No Refund on Cancellation**

**Symptoms:**
- Order cancelled but refund_amount = 0
- No refund message shown

**Possible Causes:**
- Order created without payment_intent_id
- Refund logic skipped for non-paid orders
- This is expected for test orders without actual payment

---

## 🎯 **SUCCESS CRITERIA**

Your integration is working if:

### **Must Have (Critical)**
1. ✅ Buyer can complete payment via Stripe sheet
2. ✅ Order created with payment_intent_id
3. ✅ Complete order flow works (Deliver→Collect→Return→Finish)
4. ✅ Cancellation attempts refund (for paid orders)
5. ✅ No app crashes
6. ✅ No breaking changes to existing features

### **Should Have (Important)**
7. ✅ Seller receives payout notification on finish
8. ✅ Refund shows correct amount
9. ✅ Payment history tracked
10. ✅ Error messages clear and helpful

### **Nice to Have (Future)**
11. Stripe Connect onboarding completed
12. Late penalty charging tested
13. Multiple order tests
14. Edge case handling

---

## 📝 **TEST RESULTS TEMPLATE**

Copy this and fill in your results:

```
TESTING COMPLETED: [DATE]
TESTER: [YOUR NAME]

POSTMAN TESTS:
✅/❌ Authentication
✅/❌ Equipment listing  
✅/❌ Payment intent creation
✅/❌ Order creation with payment
✅/❌ Order lifecycle
✅/❌ Cancellation & refund

ANDROID TESTS:
✅/❌ Seller login
✅/❌ Buyer login
✅/❌ Browse equipment
✅/❌ Stripe payment sheet
✅/❌ Payment success
✅/❌ Order lifecycle
✅/❌ Cancellation

CRITICAL FEATURES:
✅/❌ Payment integration working
✅/❌ Refunds working
✅/❌ No breaking changes

ISSUES FOUND:
1. [Describe issue]
2. [Describe issue]

OVERALL STATUS: ✅ PASS / ❌ FAIL / ⚠️ PARTIAL
```

---

## 📞 **SUPPORT**

**Backend Logs:**
```bash
cd "/Users/apple/Development/Backend Projects/opeec"
npm start
# Watch console for errors
```

**Stripe Dashboard:**
- Test Payments: https://dashboard.stripe.com/test/payments
- Test Refunds: https://dashboard.stripe.com/test/refunds
- Test Customers: https://dashboard.stripe.com/test/customers

**Files:**
- Credentials: `TEST_CREDENTIALS.json`
- Postman: `OPEEC_Complete_API_Collection.postman_collection.json`
- This Guide: `COMPLETE_TESTING_GUIDE.md`

---

**🎉 READY TO TEST!**

Start with Postman (15 mins) → Then Android (30 mins) → Report results

Good luck! 🚀

