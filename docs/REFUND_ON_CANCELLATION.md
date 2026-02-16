# Refund When Seller Cancels Order

## How it works

1. **Cancel request**  
   Seller (or buyer, when delivery is overdue) calls `PUT /order/cancel?order_id=<id>&reason=<text>` with a valid JWT.

2. **Eligibility**  
   - Only orders in status **Booked** can be cancelled.  
   - **Seller**: can cancel any time before delivery.  
   - **Buyer**: can cancel only when delivery is **overdue** (scheduled start date has passed and seller has not delivered).

3. **Backend flow**  
   - Order is updated: `rental_status = "Cancelled"`, `cancellation` (reason, `cancelled_by`, etc.) is set.  
   - **Settlement**: `processOrderCancellation(orderId, isBeforeCutoff)` runs (wallet/ledger entries).  
   - **Refund amount**: If cancelled **before** delivery (`isBeforeCutoff === true`), the buyer is due a **full** refund = `order.total_amount`.  
   - **Stripe refund**: If the order has `stripe_payment.payment_intent_id` and `refundAmount > 0`, `processRefund(orderId, refundAmount)` is called. That creates a Stripe refund on the PaymentIntent and updates the order’s `stripe_payment` (refund_id, refund_amount, payment_status, etc.).  
   - If the Stripe refund fails, an **admin notification** is created (`refund_failed`) so someone can process the refund manually.

4. **Response**  
   - `200`: `{ message, status: true, order_id, rental_status: "Cancelled", refund_processed: true|false, refund_amount }`.  
   - Buyer sees money back on their card per Stripe’s timing (usually 5–10 days).

## How to test (seller cancels, refund)

### Prerequisites

- Backend running (e.g. `npm run dev`).  
- Stripe in **test mode** when testing locally (e.g. `NODE_ENV=development` so test keys are used).  
- Two test users: **buyer** and **seller** (equipment owner).

### Steps

1. **Create and pay for an order (as buyer)**  
   - In the app (or via API): book equipment, go to checkout, pay with a Stripe test card (e.g. `4242 4242 4242 4242`).  
   - Ensure the order is in status **Booked** and has `stripe_payment.payment_intent_id` and `payment_status: "succeeded"` in the DB.

2. **Cancel as seller**  
   - Log in as the **seller** (owner of the equipment).  
   - Call cancel:  
     `PUT /order/cancel?order_id=<order_id>&reason=Equipment%20unavailable`  
     Header: `Authorization: Bearer <seller_jwt>`.  
   - Expect: `200`, `refund_processed: true`, `refund_amount` equal to order total.

3. **Verify in backend**  
   - Order document: `rental_status === "Cancelled"`, `stripe_payment.refund_id` set, `stripe_payment.payment_status === "refunded"` (or similar), `refund_amount` = order total.  
   - Server logs: look for “Stripe refund of $X processed for order …”.

4. **Verify in Stripe Dashboard (test)**  
   - Go to [Stripe Dashboard → Payments](https://dashboard.stripe.com/test/payments) (test mode).  
   - Find the PaymentIntent by id (`stripe_payment.payment_intent_id`).  
   - Confirm a refund for the full amount appears.

5. **Optional: test failure path**  
   - Temporarily break Stripe (wrong key or invalid id) and cancel again (use another order).  
   - Expect admin notification `refund_failed` and no crash; order still marked Cancelled.

### Quick API test (Postman/cURL)

- Create order and get `order_id` and buyer payment success.  
- Get seller JWT (login as owner).  
- Request:  
  `PUT {{baseUrl}}/order/cancel?order_id=<order_id>&reason=Test%20cancel`  
  Header: `Authorization: Bearer <seller_token>`.  
- Check response `refund_processed` and `refund_amount`; then check DB and Stripe as above.
