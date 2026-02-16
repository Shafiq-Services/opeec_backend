# OPEEC Order System – Terms, Rules & Audit

**Document purpose:** Single reference for order lifecycle, roles, penalties, refunds, payouts, and platform rules. Covers every scenario from each user type’s point of view.

---

## 1. Order status flow

| Status     | Meaning |
|-----------|--------|
| **Booked**   | Paid; waiting for seller to mark “ready for pickup”. |
| **Delivered**| Seller marked ready for pickup; waiting for buyer to collect. |
| **Ongoing**  | Buyer collected; rental period in progress. |
| **Returned** | Buyer returned; waiting for seller to approve or auto-finish. |
| **Late**     | Past end date and not returned; penalty applies. |
| **Finished** | Completed; equipment available again; seller payout triggered. |
| **Cancelled**| Cancelled; refund rules apply by timing. |

**Automatic transitions (cron):**

- **Delivered** → **Ongoing** after configured wait (e.g. 3 hours) if buyer does not collect.
- **Ongoing** → **Late** when current time is after `rental_schedule.end_date`.
- **Returned** → **Finished** after configured wait (e.g. 3 hours) if seller does not approve (equipment set back to Active; settlement and payout run).

---

## 2. Buyer (renter) – rules and scenarios

### 2.1 Booking and payment

- Must be logged in; payment required at checkout (Stripe).
- Order is created only with valid `payment_intent_id` and successful payment.
- Full amount (rental + platform fee + tax + insurance/deposit) is charged at booking.

### 2.2 Before rental start

- **Cancel (buyer):** Allowed only when delivery is **overdue** (scheduled start date passed and status still Booked). Full refund.
- **Cancel (seller):** Seller can cancel Booked orders; buyer receives full refund.

### 2.3 Delivery / collection

- **Collect:** Buyer can mark “Collected” only after the configured time since “Delivered” (e.g. 3 hours). Before that, API returns “wait X minutes”.
- If buyer never collects, order auto-moves Delivered → Ongoing after the wait.

### 2.4 During rental (Ongoing)

- Must return by `rental_schedule.end_date`. If not, order becomes **Late** and late penalty applies (see Penalties).

### 2.5 Return

- Buyer marks “Return” with at least one image. Status becomes **Returned**.
- After a configured wait (e.g. 3 hours), if seller does nothing, order auto-finishes (Returned → Finished).

### 2.6 Late orders

- **Late penalty:** Applied automatically: `(days_late + 1) × DAILY_PENALTY` (e.g. $50/day). Charged to saved payment method when possible; otherwise admin is notified for manual collection.
- Buyer can **dispute penalty** (e.g. POST dispute); admin is notified to review.
- Seller can **toggle penalty** (waive or re-apply) before finishing. Only seller can finish a Late order (no wait time).

### 2.7 Cancellation and refunds (buyer view)

- **Before delivery (Booked):** Cancellation → full refund (Stripe refund).
- **After delivery overdue (seller didn’t deliver):** Buyer may cancel; full refund.
- **After delivery / ongoing:** Cancellation and refund rules are per backend (e.g. no refund or partial; see refund logic in code).

### 2.8 Finished orders

- Buyer can leave a review after order is Finished.
- Deposit (if any) is refunded per platform rules when order completes successfully.

---

## 3. Seller (equipment owner) – rules and scenarios

### 3.1 Listing and equipment

- Equipment must be approved (Active) to appear in listings.
- Seller can set equipment to **InActive** (deactivate) or **Active** (reactivate) via app; only Active can be booked.
- Equipment goes **InActive** when order is marked **Delivered** (ready for pickup) and returns to **Active** when order is **Finished** (manual or auto).

### 3.2 Deliver (mark ready for pickup)

- Allowed only for **Booked** orders and only **on or after** the rental **start date** (calendar day). Otherwise API returns 400 with message.
- Requires at least one image. Order → **Delivered**; equipment → **InActive**.

### 3.3 Collection

- No seller action required for “collection”; buyer marks Collected after the wait. System can auto-move Delivered → Ongoing after the same wait.

### 3.4 Return and finish

- When status is **Returned**, seller can **Approve (Finish)** after the configured wait (e.g. 3 hours). Before that, API returns “order can be finished in X minutes”.
- **Late** orders can be finished immediately by seller (no wait).
- On **Finish** (manual or auto): order → **Finished**, equipment → **Active**, settlement runs, Stripe payout to seller’s Connect account is triggered.

### 3.5 Payout (seller)

- **When:** On **Finished** (seller tapped Approve or cron auto-finished).
- **How:** `processOrderCompletion` (wallet/ledger) + `triggerAutomaticPayout` (Stripe Transfer to seller’s Connect account). Seller receives rental_fee minus penalties; platform keeps platform fee.
- **Requirement:** Seller must have completed Stripe Connect onboarding (payouts enabled). Otherwise transfer is skipped and logged.

### 3.6 Cancellation (seller)

- Seller can cancel **Booked** orders (e.g. equipment unavailable). Full refund to buyer; no payout to seller.

### 3.7 Penalty (seller)

- Seller can **toggle penalty** on Late orders (waive or re-apply) before finishing. Only owner can call this.
- Penalty dispute from buyer creates admin notification; admin resolves.

---

## 4. Admin – rules and scenarios

### 4.1 Orders

- Can view all orders and filter by status; full pricing and breakdown.
- No automatic status changes by admin in this doc; admin can use internal tools/DB if needed for exceptions.

### 4.2 Equipment

- Can approve/reject/block equipment (Pending → Active/Rejected/Blocked).
- Can update equipment status (e.g. update-status); used for Rejected, Blocked, etc.
- Equipment edits by owner re-submit for review (e.g. back to Pending).

### 4.3 Users

- Can block/unblock users; blocked users get appropriate restrictions.
- Verification (e.g. Stripe Identity) can affect listing/booking rights; admin sees verification state.

### 4.4 Penalties and disputes

- **Late penalty manual collection:** If automatic charge fails, admin is notified to collect manually.
- **Penalty dispute:** Buyer disputes → admin notified; admin reviews and can adjust or uphold (process not fully automated in app; admin uses tools/refunds as needed).

### 4.5 Refunds

- Cancellation refunds are automated (Stripe) when applicable. If refund fails, admin is notified (e.g. refund_failed) for manual processing.
- Admin can process manual refunds via Stripe/dashboard when needed.

### 4.6 Payouts and wallet

- Seller payout is automatic on Finished (Stripe Connect transfer). Admin does not approve individual order payouts.
- Withdrawal requests (if applicable) may go through admin approval per wallet/withdrawal design.
- Admin can view transactions and balances for support/audit.

### 4.7 Notifications

- Admin receives in-app (and optionally email) notifications for: new user, new equipment, cancellations, refund failures, late returns, penalty disputes, manual penalty collection, etc.

---

## 5. Platform – rules and constants

### 5.1 Timing (configurable via env)

- **TIME_OFFSET_HOURS** (e.g. 3): Wait (in hours) before: Delivered → Ongoing (auto), Returned → Finished (auto), and before buyer can Collect / seller can Finish.
- **DAILY_PENALTY** (e.g. 50): Amount per day (or per period) for late return; applied automatically when order becomes Late.

### 5.2 Fees and money flow

- **At booking:** Customer pays full amount (rental + platform fee + tax + insurance/deposit). Platform holds funds.
- **Platform fee:** Deducted from each order; retained by platform.
- **Seller payout:** On Finished, transfer to seller = rental_fee − penalties (and any other deductions per logic). Platform fee is not transferred to seller.
- **Refunds:** On cancellation, buyer refund = full or partial per rules; refund processed via Stripe.

### 5.3 Equipment status (platform logic)

- **Delivered:** Equipment set to InActive (not listable).
- **Finished:** Equipment set back to Active (listable again). Same for manual and auto-finish.

### 5.4 Idempotency and safety

- Payout per order is triggered once (tracked e.g. via `stripe_payout.transfer_id`).
- Settlement (e.g. processOrderCompletion) is called on every finish path (manual and cron).
- Order state transitions are validated (e.g. only Returned/Late can be finished; only owner can finish).

---

## 6. Scenario matrix (who can do what)

| Action              | Buyer | Seller | Admin |
|---------------------|-------|--------|-------|
| Create order (pay)   | ✓     | –      | –     |
| Cancel (Booked)     | ✓*    | ✓      | (tools) |
| Mark Delivered      | –     | ✓ (on/after start date) | – |
| Mark Collected      | ✓ (after wait) | – | – |
| Mark Returned       | ✓     | –      | –     |
| Finish (Approve)    | –     | ✓ (after wait or Late) | – |
| Toggle penalty      | –     | ✓ (owner) | – |
| Dispute penalty     | ✓     | –      | –     |
| Deactivate/activate listing | – | ✓ | – |
| View own orders     | ✓     | ✓      | ✓ (all) |
| Automatic transitions | –  | –      | – (cron) |

\* Buyer cancel: only when delivery overdue (if applicable per product).

---

## 7. Penalties – summary

- **When:** Order is past `rental_schedule.end_date` and not returned → status **Late**.
- **Amount:** `(days_late + 1) × DAILY_PENALTY` (e.g. $50/day); recalculated/updated by cron.
- **Collection:** Automatic charge to buyer’s saved payment method when possible; otherwise admin notified for manual collection.
- **Seller:** Can waive or re-apply (toggle) before finishing. On finish, seller payout = rental_fee − penalty (if applied).
- **Dispute:** Buyer can dispute; admin notified to review.

---

## 8. Refunds – summary

- **Booked, cancelled (before delivery):** Full refund to buyer.
- **Delivery overdue (seller didn’t deliver), buyer cancels:** Full refund.
- **Other cancellations:** Per backend refund logic (may be partial or none).
- Refunds are processed via Stripe; on failure, admin is notified.

---

## 9. Payout to seller – summary

- **When:** Order becomes **Finished** (seller Approve or cron auto-finish).
- **Steps:** Settlement (e.g. processOrderCompletion) + Stripe Transfer to seller’s Connect account (triggerAutomaticPayout).
- **Amount:** Seller’s share (e.g. rental_fee − penalties). Platform keeps platform fee.
- **Requirement:** Seller must have Stripe Connect onboarding complete and payouts enabled.
- **Equipment:** Set back to Active so it can be rented again.

---

This document is the single audit/terms reference for the order system, roles, penalties, and platform rules. For implementation details (APIs, env vars, Stripe), see code and other docs (e.g. REFUND_ON_CANCELLATION.md, PAYOUT_ON_FINISH.md).
