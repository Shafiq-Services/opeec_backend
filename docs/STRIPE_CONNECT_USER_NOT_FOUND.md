# Stripe Connect "User Not Found" – Research & Fix

## Root causes

From Stripe docs and troubleshooting, "User not found" on the Connect onboarding page usually comes from:

### 1. Missing representative (Person)

Stripe Connect Express accounts must have a **Person** with `relationship.representative = true` before onboarding.

From [Stripe Express docs](https://docs.stripe.com/connect/express-accounts):

> "After creating the Account, create a Person to represent the person responsible for opening the account, with relationship.representative set to true and any account information you want to prefill."

Without this, the account can end up with a **"Provide a representative"** past-due requirement, which can lead to "User not found" and restricted status.

### 2. Test vs live key mismatch

If the Connect account was created with test keys but is accessed with live keys (or the opposite), Stripe returns "does not have access to account".

### 3. Restricted / rejected accounts

When an account is restricted (e.g. past-due requirements) or rejected, the refresh URL is used. If the refresh handler doesn’t create a new Account Link, the user may see "User not found" or similar errors.

### 4. Account Link already used or expired

Account Links are single-use and expire after a few minutes. Reusing an old URL can cause errors.

---

## Changes made

### 1. Create Person (representative)

`stripeConnectController.js` now creates a **Person** right after creating the Connect account:

```javascript
await stripe.accounts.createPerson(account.id, {
  first_name: firstName,
  last_name: lastName,
  relationship: { representative: true },
});
```

Names are taken from `user.name`, split into first and last.

### 2. Treat restricted / invalid accounts as unusable

When creating an Account Link or refreshing status, these Stripe errors are now treated as "account unusable":

- `account_invalid`
- "does not have access to account"
- "application access may have been revoked"

In those cases the backend clears the stored account and creates a new Connect account so the user can try again.

---

## Testing checklist

1. Use an **incognito** (or fresh) browser when testing with test keys.
2. In the Stripe Dashboard, ensure **"Viewing test data"** is enabled.
3. Use **`000-000`** as the SMS code for test accounts.
4. Make sure the **platform profile** is complete in [Connect settings](https://dashboard.stripe.com/account/applications/settings).

---

## Scripts for manual activation

### Custom account (full API activation)

To activate a Connect account purely via Stripe APIs (no browser):

```bash
node scripts/createAndActivateCustomConnectAccount.js seller.test@opeec.app
```

This script:
1. Deletes any existing Connect account
2. Creates a **Custom** account with test data (bank, DOB, SSN)
3. Waits ~10s for Stripe verification
4. Syncs status to MongoDB

The user ends up with `account_status: active` and `onboarding_completed: true`. Transfers work.

### Express account (requires hosted onboarding)

For **Express** accounts, Stripe does not allow adding external accounts or ToS via API (`oauth_not_supported`). To activate:

1. Run `createStripeConnectAccount.js` to create an Express account
2. Open the onboarding URL in a browser
3. Use test bank: routing `110000000`, account `000123456789`
4. Use `000-000` for SMS verification

---

## References

- [Stripe Connect Express Accounts](https://docs.stripe.com/connect/express-accounts)
- [Stripe Connect Testing](https://docs.stripe.com/connect/testing)
- [Account Links API](https://docs.stripe.com/api/account_links)
