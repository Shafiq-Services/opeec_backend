# Payout to Seller When Booking is Finished

## Summary

**Yes – the money collected from the customer is automatically deposited to the seller (equipment owner) once the booking is marked Finished.**

This happens whether the order is finished **manually** (seller taps "Approve" after return) or **automatically** (cron marks Returned → Finished after the waiting period).

---

## Flow

1. **Customer pays at checkout**  
   Payment is captured via Stripe (PaymentIntent). Funds are held by the platform.

2. **Order lifecycle**  
   Booked → Delivered → Ongoing → Returned → **Finished**

3. **When order becomes Finished**
   - **Manual:** Seller taps "Approve" on the return (PUT /order/finish).
   - **Automatic:** After the buyer returns the item, if the seller does not approve within the configured waiting period, a cron job automatically changes the order from **Returned** to **Finished**.

4. **On Finished (both manual and auto):**
   - **Settlement:** `processOrderCompletion(orderId)` runs – creates wallet/ledger transactions for the seller’s earnings.
   - **Payout:** `triggerAutomaticPayout(orderId)` runs – creates a **Stripe Transfer** from the platform to the seller’s **Stripe Connect** account.
   - **Equipment:** The equipment is set back to **Active** so it can be listed for rent again.

5. **Seller receives money**
   - The transfer goes to the seller’s connected Stripe Connect account.
   - Stripe then pays out to the seller’s bank account (typically 2–7 business days, depending on Stripe/bank).
   - **Requirement:** The seller must have completed **Stripe Connect onboarding** (bank account linked, payouts enabled). Otherwise the transfer is skipped and the backend logs a warning.

---

## Amount transferred

- **Transfer amount** = `order.rental_fee - (order.penalty_amount || 0)`  
  (Platform fee and other deductions are handled separately; the seller receives their rental fee minus any late penalties.)

---

## If payout doesn’t happen

- Check server logs for: `💸 Stripe payout triggered` or `⚠️ Stripe payout skipped: <reason>`.
- Common reasons for skip/failure:
  - Seller has no Stripe Connect account or onboarding incomplete.
  - `payouts_enabled` is false for the Connect account.
  - Transfer amount ≤ 0 (e.g. fully penalized).
  - Transfer for this order was already created (idempotency).

---

## Equipment status after finish

- When the order is set to **Finished** (manual or auto), the equipment’s `equipment_status` is set back to **Active** so the listing is available for new bookings.
- Previously, only the **manual** finish path did this; the **automatic** (cron) finish now does the same so the item no longer stays "Deactive" after auto-finish.
