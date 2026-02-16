/**
 * Manually create Stripe Connect account for a user via Stripe API
 * and save to MongoDB.
 *
 * Usage: node scripts/createStripeConnectAccount.js
 */

const mongoose = require('mongoose');
const Stripe = require('stripe');
require('dotenv').config();

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

const stripeDevDefaults = require('../config/stripeDevDefaults');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://opeecuser:4aGN7vh7e5nOz3aa@opeeccluster.pb7dv.mongodb.net/your_database?retryWrites=true&w=majority';

// User to create Connect account for (by email)
const USER_EMAIL = 'seller.test@opeec.app';
const COUNTRY = 'US';

function getStripe() {
  if (process.env.STRIPE_SECRET_KEY) {
    return Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return Stripe(stripeDevDefaults.STRIPE_SECRET_KEY);
}

function getConnectBaseUrl() {
  const base = process.env.BASE_URL || process.env.BACKEND_URL || 'https://opeec.azurewebsites.net';
  return base.replace(/\/$/, '');
}

async function createConnectAccount() {
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

    const userId = user._id.toString();
    console.log(`📋 User: ${user.name} (${user.email})`);
    console.log(`📋 User ID: ${userId}\n`);

    // 1. Create Stripe Connect account
    console.log('━'.repeat(60));
    console.log('Creating Stripe Connect account...');
    console.log('━'.repeat(60));

    const account = await stripe.accounts.create({
      type: 'express',
      country: COUNTRY,
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
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

    console.log(`✅ Account created: ${account.id}`);

    // 2. Create Person (representative)
    const nameParts = (user.name || 'User').trim().split(/\s+/);
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || 'Account';

    await stripe.accounts.createPerson(account.id, {
      first_name: firstName,
      last_name: lastName,
      relationship: { representative: true },
    });
    console.log(`✅ Person (representative) created`);

    // 3. Create Account Link
    const baseUrl = getConnectBaseUrl();
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${baseUrl}/stripe-connect/refresh`,
      return_url: `${baseUrl}/stripe-connect/success`,
      type: 'account_onboarding',
    });
    console.log(`✅ Account Link created (expires in ~5 min)`);

    // 4. Save to MongoDB
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          'stripe_connect.account_id': account.id,
          'stripe_connect.account_status': 'pending',
          'stripe_connect.onboarding_completed': false,
          'stripe_connect.charges_enabled': false,
          'stripe_connect.payouts_enabled': false,
          'stripe_connect.details_submitted': false,
          'stripe_connect.onboarding_url': accountLink.url,
          'stripe_connect.onboarding_url_created_at': new Date(),
          'stripe_connect.last_updated': new Date(),
        },
      }
    );
    console.log(`✅ Saved to MongoDB (user: ${userId})`);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 DONE! Stripe Connect account created.');
    console.log('='.repeat(60));
    console.log(`\nAccount ID: ${account.id}`);
    console.log(`\nOnboarding URL (open in browser to complete setup):`);
    console.log(accountLink.url);
    console.log('\n⚠️  Link expires in ~5 minutes. User can also get a fresh link from the app.');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

createConnectAccount();
