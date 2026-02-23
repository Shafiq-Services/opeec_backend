# Revenue and Refund Verification

This document confirms how platform revenue and security deposit refunds work.

## Opeec account is credited (platform fee + insurance + tax)

1. **Customer payment:** The renter pays `total_amount` (rental_fee + platform_fee + tax_amount + insurance_amount OR deposit_amount) to the **platform Stripe account** when booking.

2. **On order completion (Finished):**
   - **Seller payout:** `triggerAutomaticPayout(orderId)` transfers **rental_fee − penalty_amount** to the seller’s Stripe Connect account. The seller does **not** receive platform_fee, tax, or insurance.
   - **What stays with Opeec:** The platform keeps everything not transferred to the seller and not refunded:
     - **Insurance orders:** Opeec retains **platform_fee + tax_amount + insurance_amount**.
     - **Deposit orders:** After refunding the security deposit to the renter, Opeec retains **platform_fee + tax_amount**.

3. **Code references:**
   - `controllers/stripeConnectController.js`: `triggerAutomaticPayout` — transfer amount = `order.rental_fee - (order.penalty_amount || 0)`.
   - `utils/feeCalculations.js`: Comment — "To Opeec: insurance_amount + platform_fee + tax_amount (retained from payment)."

## Security deposit is refunded to the buyer (renter)

1. **When:** When the order is marked **Finished** (seller confirms equipment received and completes the order via `finishOrder` in `controllers/orders.js`).

2. **Condition:** Only when the renter chose **security deposit** (not insurance). If they chose insurance, there is no deposit to refund.

3. **Implementation:** In `orders.js` `finishOrder` (after settlement):
   - `depositAmount = order.deposit_amount || 0`
   - If `!order.security_option?.insurance && depositAmount > 0` and payment succeeded, `processRefund(order._id, depositAmount, 'requested_by_customer')` is called.
   - This creates a Stripe refund on the original payment intent, returning the deposit to the renter’s payment method.

4. **Code reference:** `controllers/orders.js` around lines 977–994: "Refund security deposit to renter when equipment is marked as received (only for deposit option, not insurance)."
