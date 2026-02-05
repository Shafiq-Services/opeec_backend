/**
 * Script to reset Stripe Connect data for users
 * 
 * This allows users to re-onboard to a NEW Stripe account
 * after the platform switched Stripe accounts.
 * 
 * Usage: node scripts/resetStripeConnectForUsers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection string from .env
const MONGO_URI = process.env.MONGO_URI;

// Users to reset (by email) - leave empty to reset ALL users with stripe_connect
const SPECIFIC_USERS = [
  // Empty = reset ALL users
];

// User schema (simplified for this script)
const userSchema = new mongoose.Schema({
  email: String,
  stripe_connect: {
    account_id: String,
    account_status: String,
    payouts_enabled: Boolean,
    details_submitted: Boolean,
    onboarding_url: String,
    created_at: Date
  }
}, { strict: false });

const User = mongoose.model('User', userSchema);

async function resetStripeConnect() {
  console.log('='.repeat(60));
  console.log('  RESET STRIPE CONNECT FOR USERS');
  console.log('='.repeat(60));
  
  try {
    // Connect to MongoDB with extended timeout options
    console.log('\n📡 Connecting to MongoDB...');
    console.log('   Using URI:', MONGO_URI ? MONGO_URI.replace(/:[^:@]+@/, ':***@') : 'NOT SET');
    
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4  // Force IPv4
    });
    console.log('✅ Connected to MongoDB\n');

    let query = {};
    
    if (SPECIFIC_USERS.length > 0) {
      // Case-insensitive email search
      query = { 
        email: { 
          $in: SPECIFIC_USERS.map(e => new RegExp(`^${e}$`, 'i')) 
        } 
      };
      console.log(`🔍 Looking for specific users: ${SPECIFIC_USERS.join(', ')}\n`);
    } else {
      // Reset all users with stripe_connect data
      query = { 'stripe_connect.account_id': { $exists: true, $ne: '' } };
      console.log('🔍 Looking for ALL users with Stripe Connect data\n');
    }

    const users = await User.find(query);
    
    if (users.length === 0) {
      console.log('❌ No users found matching criteria');
      return;
    }

    console.log(`📋 Found ${users.length} user(s) to reset:\n`);
    console.log('-'.repeat(60));

    for (const user of users) {
      console.log(`\n👤 User: ${user.email}`);
      console.log(`   Current account_id: ${user.stripe_connect?.account_id || 'none'}`);
      console.log(`   Current status: ${user.stripe_connect?.account_status || 'none'}`);
      
      // Reset stripe_connect data
      user.stripe_connect = {
        account_id: '',
        account_status: 'not_connected',
        payouts_enabled: false,
        details_submitted: false,
        onboarding_url: '',
        created_at: null
      };
      
      await user.save();
      
      console.log(`   ✅ Reset to: not_connected`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`  ✅ Successfully reset ${users.length} user(s)`);
    console.log('='.repeat(60));
    console.log('\nUsers can now connect to the NEW Stripe account!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.log('\n💡 DNS Resolution failed. Try:');
      console.log('   1. Check your internet connection');
      console.log('   2. Change DNS to 8.8.8.8 in System Settings');
      console.log('   3. Or use MongoDB Compass manually\n');
    }
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from MongoDB');
  }
}

// Run the script
resetStripeConnect();
