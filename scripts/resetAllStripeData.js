/**
 * Reset ALL Stripe-related data for ALL users
 * This clears both Identity Verification and Stripe Connect data
 * 
 * Usage: node scripts/resetAllStripeData.js
 * 
 * WARNING: This will reset Stripe data for ALL users in the database!
 */

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection string
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://opeecuser:4aGN7vh7e5nOz3aa@opeeccluster.pb7dv.mongodb.net/your_database?retryWrites=true&w=majority';

async function resetAllStripeData() {
  try {
    console.log('='.repeat(70));
    console.log('  🔄 RESET ALL STRIPE DATA FOR ALL USERS');
    console.log('='.repeat(70));
    console.log('\n⚠️  WARNING: This will reset Stripe data for ALL users!\n');
    
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Count users before reset
    const totalUsers = await usersCollection.countDocuments();
    const usersWithVerification = await usersCollection.countDocuments({
      $or: [
        { 'stripe_verification.status': { $exists: true, $ne: 'not_verified' } },
        { isUserVerified: true }
      ]
    });
    const usersWithConnect = await usersCollection.countDocuments({
      'stripe_connect.account_id': { $exists: true, $ne: '' }
    });

    console.log('📊 Current Status:');
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Users with verification: ${usersWithVerification}`);
    console.log(`   Users with Stripe Connect: ${usersWithConnect}`);
    console.log('');

    // Reset ALL users' Stripe Identity Verification data
    console.log('🔄 Resetting Stripe Identity Verification data...');
    const verificationResult = await usersCollection.updateMany(
      {}, // Match ALL users
      {
        $set: {
          isUserVerified: false,
          'stripe_verification.status': 'not_verified',
          'stripe_verification.session_id': null,
          'stripe_verification.session_url': null,
          'stripe_verification.failure_reason': null,
          'stripe_verification.verified_at': null,
          'stripe_verification.last_attempt_at': null,
          'stripe_verification.attempts': [],
          'stripe_verification.fee_paid': false,
          'stripe_verification.attempts_count': 0
        }
      }
    );
    console.log(`   ✅ Reset verification for ${verificationResult.modifiedCount} users`);

    // Reset ALL users' Stripe Connect data
    console.log('🔄 Resetting Stripe Connect data...');
    const connectResult = await usersCollection.updateMany(
      {}, // Match ALL users
      {
        $set: {
          'stripe_connect.account_id': '',
          'stripe_connect.account_status': 'not_connected',
          'stripe_connect.onboarding_completed': false,
          'stripe_connect.onboarding_url': '',
          'stripe_connect.onboarding_url_created_at': null,
          'stripe_connect.payouts_enabled': false,
          'stripe_connect.charges_enabled': false,
          'stripe_connect.details_submitted': false,
          'stripe_connect.external_account': null,
          'stripe_connect.last_updated': null
        }
      }
    );
    console.log(`   ✅ Reset Stripe Connect for ${connectResult.modifiedCount} users`);

    // Verify the reset
    console.log('\n📊 After Reset:');
    const afterVerification = await usersCollection.countDocuments({
      $or: [
        { 'stripe_verification.status': { $exists: true, $ne: 'not_verified' } },
        { isUserVerified: true }
      ]
    });
    const afterConnect = await usersCollection.countDocuments({
      'stripe_connect.account_id': { $exists: true, $ne: '' }
    });
    console.log(`   Users with verification: ${afterVerification} (should be 0)`);
    console.log(`   Users with Stripe Connect: ${afterConnect} (should be 0)`);

    console.log('\n' + '='.repeat(70));
    console.log('  🎉 ALL STRIPE DATA HAS BEEN RESET!');
    console.log('='.repeat(70));
    console.log('\n✅ All users can now test:');
    console.log('   1. Stripe Identity Verification (fresh start)');
    console.log('   2. Stripe Connect bank connection (fresh start)');
    console.log('\n⚠️  Note: Old Stripe accounts still exist in Stripe Dashboard.');
    console.log('   New accounts will be created when users start onboarding.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.log('\n💡 DNS Resolution failed. Try:');
      console.log('   1. Check your internet connection');
      console.log('   2. Change DNS to 8.8.8.8 in System Settings');
    }
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
resetAllStripeData();
