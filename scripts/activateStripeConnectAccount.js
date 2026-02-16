/**
 * Manually activate a Stripe Connect account using Stripe APIs:
 * - Add test external bank account
 * - Update ToS acceptance
 * - Sync status to MongoDB
 *
 * For Express accounts, external account creation may be restricted (Stripe-hosted onboarding).
 * This script attempts API-based activation; if it fails, complete onboarding via Account Link.
 *
 * Usage:
 *   node scripts/activateStripeConnectAccount.js
 *   node scripts/activateStripeConnectAccount.js seller.test@opeec.app
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/activateStripeConnectAccount.js
 */

const mongoose = require('mongoose');
const Stripe = require('stripe');
require('dotenv').config();

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

const stripeDevDefaults = require('../config/stripeDevDefaults');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://opeecuser:4aGN7vh7e5nOz3aa@opeeccluster.pb7dv.mongodb.net/your_database?retryWrites=true&w=majority';

// User to activate (by email) - can override via CLI arg
const DEFAULT_USER_EMAIL = 'seller.test@opeec.app';
const USER_EMAIL = process.argv[2] || DEFAULT_USER_EMAIL;

// Test bank account from Stripe docs: https://docs.stripe.com/connect/testing
const TEST_BANK = {
  object: 'bank_account',
  country: 'US',
  currency: 'usd',
  account_number: '000123456789',
  routing_number: '110000000',
  account_holder_name: 'Test Account Holder',
};

function getStripe() {
  if (process.env.STRIPE_SECRET_KEY) {
    return Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return Stripe(stripeDevDefaults.STRIPE_SECRET_KEY);
}

async function activateConnectAccount() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const stripe = getStripe();
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ email: USER_EMAIL });
    if (!user) {
      console.error(`❌ User not found: ${USER_EMAIL}`);
      process.exit(1);
    }

    const accountId = user.stripe_connect?.account_id;
    if (!accountId) {
      console.error(`❌ User has no Stripe Connect account_id. Run createStripeConnectAccount.js first.`);
      process.exit(1);
    }

    console.log(`📋 User: ${user.name} (${user.email})`);
    console.log(`📋 Account ID: ${accountId}\n`);

    // 1. Retrieve current account state
    console.log('━'.repeat(60));
    console.log('1. Retrieving Stripe account...');
    console.log('━'.repeat(60));
    let account = await stripe.accounts.retrieve(accountId);
    console.log(`   charges_enabled: ${account.charges_enabled}`);
    console.log(`   payouts_enabled: ${account.payouts_enabled}`);
    console.log(`   details_submitted: ${account.details_submitted}`);
    console.log(`   controller.requirement_collection: ${account.controller?.requirement_collection || 'N/A'}\n`);

    if (account.payouts_enabled && account.charges_enabled) {
      console.log('✅ Account is already active. Syncing MongoDB...\n');
    } else {
      // 2. Add external bank account (may fail for Express - requirement_collection=stripe)
      console.log('━'.repeat(60));
      console.log('2. Adding test external bank account...');
      console.log('━'.repeat(60));
      try {
        await stripe.accounts.createExternalAccount(accountId, {
          external_account: TEST_BANK,
        });
        console.log('   ✅ External bank account added\n');
      } catch (err) {
        console.log(`   ⚠️ Could not add external account via API: ${err.code || err.type} - ${err.message}`);
        if (err.code === 'account_invalid' || err.message?.includes('requirement_collection') || err.message?.includes('external account')) {
          console.log('   Express accounts require bank info via Stripe hosted onboarding.');
          console.log('   Generate Account Link and complete onboarding in browser with test data:');
          console.log('   - Routing: 110000000, Account: 000123456789');
          console.log('   - Use 000-000 for SMS verification\n');
        }
      }

      // 3. Update ToS acceptance (allowed before Account Link is used)
      console.log('━'.repeat(60));
      console.log('3. Updating ToS acceptance...');
      console.log('━'.repeat(60));
      try {
        const now = Math.floor(Date.now() / 1000);
        account = await stripe.accounts.update(accountId, {
          tos_acceptance: {
            date: now,
            ip: '127.0.0.1',
          },
        });
        console.log('   ✅ ToS acceptance set\n');
      } catch (err) {
        console.log(`   ⚠️ Could not update ToS: ${err.code || err.type} - ${err.message}\n`);
      }

      // 4. Re-retrieve account to get latest state
      account = await stripe.accounts.retrieve(accountId);
    }

    // 5. Sync MongoDB
    console.log('━'.repeat(60));
    console.log('4. Syncing MongoDB...');
    console.log('━'.repeat(60));

    const onboardingCompleted = Boolean(account.details_submitted && account.payouts_enabled);
    const accountStatus = account.payouts_enabled ? 'active' : 'pending';

    const updateDoc = {
      'stripe_connect.charges_enabled': account.charges_enabled,
      'stripe_connect.payouts_enabled': account.payouts_enabled,
      'stripe_connect.details_submitted': account.details_submitted,
      'stripe_connect.onboarding_completed': onboardingCompleted,
      'stripe_connect.account_status': accountStatus,
      'stripe_connect.last_updated': new Date(),
    };

    if (onboardingCompleted) {
      updateDoc['stripe_connect.onboarding_url'] = '';
      updateDoc['stripe_connect.onboarding_url_created_at'] = null;
    }

    await usersCollection.updateOne(
      { _id: user._id },
      { $set: updateDoc }
    );

    console.log(`   charges_enabled: ${account.charges_enabled}`);
    console.log(`   payouts_enabled: ${account.payouts_enabled}`);
    console.log(`   details_submitted: ${account.details_submitted}`);
    console.log(`   onboarding_completed: ${onboardingCompleted}`);
    console.log(`   account_status: ${accountStatus}`);
    console.log('   ✅ MongoDB updated\n');

    console.log('='.repeat(60));
    if (account.payouts_enabled) {
      console.log('🎉 Connect account is ACTIVE in Stripe and MongoDB.');
    } else {
      console.log('⚠️  Account is still pending. Stripe Express accounts require');
      console.log('   hosted onboarding (bank + ToS) to become active.');
      console.log('   Get onboarding URL from app and complete with test bank:');
      console.log('   Routing: 110000000, Account: 000123456789');
    }
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

activateConnectAccount();
