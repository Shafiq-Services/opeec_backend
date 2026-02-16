/**
 * Replace user's Express Connect account with a Custom account and fully
 * activate it via Stripe API (no browser onboarding required).
 *
 * Custom accounts allow: external_account, tos_acceptance via API.
 * Use for testing when you need an active Connect account without hosted flow.
 *
 * Usage:
 *   node scripts/createAndActivateCustomConnectAccount.js
 *   node scripts/createAndActivateCustomConnectAccount.js seller.test@opeec.app
 */

const mongoose = require('mongoose');
const Stripe = require('stripe');
require('dotenv').config();

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

const stripeDevDefaults = require('../config/stripeDevDefaults');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://opeecuser:4aGN7vh7e5nOz3aa@opeeccluster.pb7dv.mongodb.net/your_database?retryWrites=true&w=majority';

const USER_EMAIL = process.argv[2] || 'seller.test@opeec.app';
const COUNTRY = 'US';

// Test data from Stripe docs
const TEST_BANK = {
  object: 'bank_account',
  country: 'US',
  currency: 'usd',
  account_number: '000999999991', // Completes bank verification (Stripe testing)
  routing_number: '110000000',
  account_holder_name: 'Test Account Holder',
};

// Test DOB - 1902-01-01 = immediate verification (Stripe testing guide)
const TEST_DOB = { day: 1, month: 1, year: 1902 };

// Test address
const TEST_ADDRESS = {
  line1: 'address_full_match',
  city: 'San Francisco',
  state: 'CA',
  postal_code: '94111',
};

function getStripe() {
  if (process.env.STRIPE_SECRET_KEY) {
    return Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return Stripe(stripeDevDefaults.STRIPE_SECRET_KEY);
}

async function main() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    const stripe = getStripe();
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ email: USER_EMAIL });
    if (!user) {
      console.error(`❌ User not found: ${USER_EMAIL}`);
      process.exit(1);
    }

    const userId = user._id.toString();
    const nameParts = (user.name || 'User').trim().split(/\s+/);
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || 'Account';

    console.log(`📋 User: ${user.name} (${user.email})`);
    console.log(`📋 User ID: ${userId}\n`);

    // 1. Delete existing Express account if present
    const existingAccountId = user.stripe_connect?.account_id;
    if (existingAccountId) {
      console.log('━'.repeat(60));
      console.log('1. Deleting existing Connect account...');
      console.log('━'.repeat(60));
      try {
        await stripe.accounts.del(existingAccountId);
        console.log(`   ✅ Deleted: ${existingAccountId}\n`);
      } catch (err) {
        if (err.code === 'account_invalid' || err.code === 'resource_missing') {
          console.log(`   ⚠️ Account not found in Stripe (may already be deleted)\n`);
        } else {
          throw err;
        }
      }
    }

    // 2. Create Custom account with all activation data
    console.log('━'.repeat(60));
    console.log('2. Creating Custom Connect account (activated)...');
    console.log('━'.repeat(60));

    const now = Math.floor(Date.now() / 1000);
    const account = await stripe.accounts.create({
      type: 'custom',
      country: COUNTRY,
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
      tos_acceptance: {
        date: now,
        ip: '127.0.0.1',
      },
      individual: {
        first_name: firstName,
        last_name: lastName,
        email: user.email,
        dob: TEST_DOB,
        address: TEST_ADDRESS,
        phone: '0000000000', // Test phone - successful validation
        id_number: '222222222', // Immediate ID match (Stripe testing guide)
      },
      external_account: TEST_BANK,
      business_profile: {
        mcc: '7523',
        product_description: 'Equipment rental marketplace',
        url: 'https://opeec.azurewebsites.net',
      },
      metadata: {
        user_id: userId,
        user_name: user.name,
        user_email: user.email,
      },
    });

    console.log(`   ✅ Account created: ${account.id}`);

    // 3. Fulfill any remaining requirements
    let refreshed = await stripe.accounts.retrieve(account.id);
    let req = refreshed.requirements;
    const maxAttempts = 5;
    for (let i = 0; i < maxAttempts && req?.currently_due?.length; i++) {
      console.log(`   requirements.currently_due: ${JSON.stringify(req.currently_due)}`);
      const updates = {};
      if (req.currently_due.some((r) => r.includes('individual.email'))) {
        updates.individual = { ...(updates.individual || {}), email: user.email };
      }
      if (req.currently_due.some((r) => r.includes('id_number') || r.includes('ssn'))) {
        updates.individual = { ...(updates.individual || {}), id_number: '000000000' };
      }
      if (Object.keys(updates).length) {
        console.log('   Updating account to fulfill requirements...');
        refreshed = await stripe.accounts.update(account.id, updates);
        req = refreshed.requirements;
      } else {
        break;
      }
    }
    if (req?.currently_due?.length) {
      console.log(`   ⚠️ Still due: ${JSON.stringify(req.currently_due)}\n`);
    }

    // Wait for async verification (test mode can process quickly)
    if (!refreshed.charges_enabled || !refreshed.payouts_enabled) {
      console.log('   Waiting 10s for Stripe verification...');
      await new Promise((r) => setTimeout(r, 10000));
      refreshed = await stripe.accounts.retrieve(account.id);
    }

    // DEV: force active in MongoDB for local testing (Stripe may still be verifying)
    const forceActive = process.env.FORCE_ACTIVE_IN_MONGO === '1';
    const chargesEnabled = forceActive || refreshed.charges_enabled;
    const payoutsEnabled = forceActive || refreshed.payouts_enabled;
    const detailsSubmitted = refreshed.details_submitted;

    console.log(`   charges_enabled: ${chargesEnabled}`);
    console.log(`   payouts_enabled: ${payoutsEnabled}`);
    console.log(`   details_submitted: ${detailsSubmitted}`);
    if (forceActive) console.log('   (FORCE_ACTIVE_IN_MONGO=1 - dev override)\n');
    else console.log('');

    // 4. Save to MongoDB
    console.log('━'.repeat(60));
    console.log('3. Saving to MongoDB...');
    console.log('━'.repeat(60));
    const onboardingCompleted = Boolean(detailsSubmitted && payoutsEnabled);
    const accountStatus = payoutsEnabled ? 'active' : 'pending';

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          'stripe_connect.account_id': account.id,
          'stripe_connect.account_status': accountStatus,
          'stripe_connect.onboarding_completed': onboardingCompleted,
          'stripe_connect.charges_enabled': chargesEnabled,
          'stripe_connect.payouts_enabled': payoutsEnabled,
          'stripe_connect.details_submitted': detailsSubmitted,
          'stripe_connect.last_updated': new Date(),
        },
        $unset: {
          'stripe_connect.onboarding_url': '',
          'stripe_connect.onboarding_url_created_at': '',
        },
      }
    );

    console.log(`   account_status: ${accountStatus}`);
    console.log(`   onboarding_completed: ${onboardingCompleted}`);
    console.log(`   ✅ MongoDB updated\n`);

    console.log('='.repeat(60));
    if (payoutsEnabled) {
      console.log('🎉 Connect account is ACTIVE (Custom) in Stripe and MongoDB.');
      console.log('   Transfers and payouts will work.');
    } else {
      console.log('⚠️  Account created but payouts may need verification.');
      console.log('   Check account.requirements in Stripe Dashboard.');
    }
    console.log('='.repeat(60));
    console.log(`\nAccount ID: ${account.id}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

main();
