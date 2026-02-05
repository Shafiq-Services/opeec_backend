/**
 * Reset Stripe-related data for specified users
 * This allows testing the Stripe verification and Connect flows from scratch
 * 
 * Usage: node scripts/resetStripeForUsers.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection string
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://opeecuser:4aGN7vh7e5nOz3aa@opeeccluster.pb7dv.mongodb.net/your_database?retryWrites=true&w=majority';

// Users to reset (by email)
const usersToReset = [
  'cu1@opeec.com',
  'buyer@gmail.com',
  'cu2@opeec.com',
  'alexwloe@gmail.com'
];

async function resetStripeData() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    for (const email of usersToReset) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: ${email}`);
      console.log('='.repeat(60));

      // Find user
      const user = await usersCollection.findOne({ email: email });
      
      if (!user) {
        console.log(`❌ User not found: ${email}`);
        continue;
      }

      console.log(`Found user: ${user.name || 'N/A'} (${user._id})`);
      console.log(`Current verification status: ${user.isUserVerified ? 'Verified' : 'Not Verified'}`);
      console.log(`Current Stripe verification: ${user.stripe_verification?.status || 'N/A'}`);
      console.log(`Current Stripe Connect: ${user.stripe_connect?.account_status || 'N/A'}`);

      // Reset Stripe Identity verification data
      const updateResult = await usersCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            isUserVerified: false,
            'stripe_verification.status': 'not_verified',
            'stripe_verification.session_id': null,
            'stripe_verification.session_url': null,
            'stripe_verification.failure_reason': null,
            'stripe_verification.verified_at': null,
            'stripe_verification.attempts': []
          },
          $unset: {
            // Also clear Connect data for fresh testing
            'stripe_connect.account_id': '',
            'stripe_connect.account_status': '',
            'stripe_connect.onboarding_completed': '',
            'stripe_connect.onboarding_url': '',
            'stripe_connect.onboarding_url_created_at': '',
            'stripe_connect.payouts_enabled': '',
            'stripe_connect.charges_enabled': '',
            'stripe_connect.details_submitted': '',
            'stripe_connect.external_account': ''
          }
        }
      );

      if (updateResult.modifiedCount > 0) {
        console.log(`✅ Reset Stripe data for: ${email}`);
        console.log('   - Identity verification: Reset to not_verified');
        console.log('   - Stripe Connect: Cleared');
        console.log('   - Verification attempts: Cleared');
      } else {
        console.log(`⚠️ No changes made for: ${email} (may already be reset)`);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('🎉 DONE! All specified users have been reset.');
    console.log('='.repeat(60));
    console.log('\nThese users can now test:');
    console.log('  1. Stripe Identity verification (fresh start)');
    console.log('  2. Stripe Connect bank connection (fresh start)');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

resetStripeData();
