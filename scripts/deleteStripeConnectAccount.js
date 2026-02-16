/**
 * Delete Stripe Connect account from Stripe and clear from user in DB
 * Use when a Connect account is restricted and you want to start fresh
 *
 * Usage:
 *   node scripts/deleteStripeConnectAccount.js                    # Test keys from config
 *   USE_LIVE_STRIPE=1 node scripts/deleteStripeConnectAccount.js  # Live keys from DB
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/deleteStripeConnectAccount.js  # Key from Dashboard (if account is in different Stripe)
 */

const mongoose = require('mongoose');
const Stripe = require('stripe');
require('dotenv').config();

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

const stripeDevDefaults = require('../config/stripeDevDefaults');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://opeecuser:4aGN7vh7e5nOz3aa@opeeccluster.pb7dv.mongodb.net/your_database?retryWrites=true&w=majority';

const usersToDelete = [
  { email: 'seller.test@opeec.app' },
];

async function getStripe() {
  // Override: use key from env (for accounts in different Stripe dashboard)
  if (process.env.STRIPE_SECRET_KEY) {
    console.log('Using STRIPE_SECRET_KEY from environment');
    return Stripe(process.env.STRIPE_SECRET_KEY);
  }
  if (process.env.USE_LIVE_STRIPE === '1') {
    const StripeKey = require('../models/stripeKey');
    const stripeKey = await StripeKey.findOne({});
    if (!stripeKey?.secretKey) throw new Error('Live Stripe key not found in DB');
    console.log('⚠️ Using LIVE Stripe keys from DB');
    return Stripe(stripeKey.secretKey);
  }
  console.log('Using TEST Stripe keys from config');
  return Stripe(stripeDevDefaults.STRIPE_SECRET_KEY);
}

async function deleteConnectAccount() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const stripe = await getStripe();
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    for (const entry of usersToDelete) {
      console.log('\n' + '='.repeat(60));
      let accountId = entry.accountId;
      let user;

      if (entry.userId) {
        user = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(entry.userId) });
        if (!user) {
          console.log(`❌ User not found: ${entry.userId}`);
          continue;
        }
        if (!accountId) accountId = user.stripe_connect?.account_id;
        console.log(`Processing user: ${entry.userId}${accountId ? ` (account: ${accountId})` : ''}`);
      } else if (entry.email) {
        user = await usersCollection.findOne({ email: entry.email });
        if (!user) {
          console.log(`❌ User not found: ${entry.email}`);
          continue;
        }
        accountId = accountId || user.stripe_connect?.account_id;
        console.log(`Processing: ${entry.email} (${user._id})`);
      } else if (accountId) {
        console.log(`Processing account: ${accountId}`);
      } else {
        console.log('❌ Must specify email, accountId, or userId');
        continue;
      }

      if (!accountId) {
        console.log('⚠️ No Stripe Connect account_id found - nothing to delete from Stripe');
        if (user) {
          const u = await usersCollection.updateOne(
            { _id: user._id },
            {
              $set: {
                'stripe_connect.account_id': '',
                'stripe_connect.account_status': 'not_connected',
                'stripe_connect.onboarding_completed': false
              },
              $unset: {
                'stripe_connect.onboarding_url': '',
                'stripe_connect.onboarding_url_created_at': '',
                'stripe_connect.payouts_enabled': '',
                'stripe_connect.charges_enabled': '',
                'stripe_connect.details_submitted': ''
              }
            }
          );
          if (u.modifiedCount > 0) console.log('   ✅ Cleared Connect data from DB');
        }
        continue;
      }

      // 1. Delete from Stripe
      try {
        await stripe.accounts.del(accountId);
        console.log(`✅ Deleted Connect account from Stripe: ${accountId}`);
      } catch (err) {
        console.log(`Stripe API error: ${err.code || err.type} - ${err.message}`);
        if (err.code === 'account_invalid' || err.code === 'resource_missing' ||
            err.message?.includes('No such account') || err.message?.includes('does not exist')) {
          console.log(`⚠️ Account ${accountId} not found in Stripe (may already be deleted or in different Stripe account)`);
        } else {
          throw err;
        }
      }

      // 2. Clear from user in DB (use explicit userId, or find by account_id)
      let userId = user?._id;
      if (!userId && accountId) {
        const u = await usersCollection.findOne({ 'stripe_connect.account_id': accountId });
        userId = u?._id;
      }
      if (userId) {
        const updateResult = await usersCollection.updateOne(
          { _id: userId },
          {
            $set: {
              'stripe_connect.account_id': '',
              'stripe_connect.account_status': 'not_connected',
              'stripe_connect.onboarding_completed': false
            },
            $unset: {
              'stripe_connect.onboarding_url': '',
              'stripe_connect.onboarding_url_created_at': '',
              'stripe_connect.payouts_enabled': '',
              'stripe_connect.charges_enabled': '',
              'stripe_connect.details_submitted': ''
            }
          }
        );
        if (updateResult.modifiedCount > 0) {
          console.log('✅ Cleared Connect data from user in DB');
        } else {
          console.log('⚠️ No DB update (user may not have had Connect data)');
        }
      } else {
        console.log('⚠️ Could not find user with this account_id in DB');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 DONE! Connect account(s) deleted.');
    console.log('='.repeat(60));
    console.log('\nUser can now create a new Connect account from the app.');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

deleteConnectAccount();
