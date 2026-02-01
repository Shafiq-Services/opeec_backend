/**
 * Script to bypass verification for test users
 * 
 * This script marks specific users as:
 * - User verified (isUserVerified: true)
 * - Stripe verification complete (stripe_verification.status: 'verified')
 * - Stripe Connect active (stripe_connect.account_status: 'active')
 * 
 * Usage: node scripts/bypassVerificationForTestUsers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection string from .env
const MONGO_URI = process.env.MONGO_URI;

// Users to mark as verified (by email)
const TEST_USERS = [
  'cu1@opeec.com',
  'Cu1@opeec.com', 
  'Cu2@opeec.com',
  'cu2@opeec.com',
  'alexwloe@gmail.com'
];

// User schema (simplified for this script)
const userSchema = new mongoose.Schema({
  email: String,
  isUserVerified: Boolean,
  stripe_verification: {
    status: String,
    verified_at: Date,
    session_id: String,
    verification_reference: String,
    verification_fee_paid: Boolean
  },
  stripe_connect: {
    account_id: String,
    account_status: String,
    onboarding_completed: Boolean,
    charges_enabled: Boolean,
    payouts_enabled: Boolean,
    details_submitted: Boolean
  }
}, { strict: false });

const User = mongoose.model('User', userSchema);

async function bypassVerification() {
  console.log('='.repeat(60));
  console.log('  BYPASS VERIFICATION FOR TEST USERS');
  console.log('='.repeat(60));
  
  try {
    // Connect to MongoDB with extended timeout options
    console.log('\n📡 Connecting to MongoDB...');
    console.log('   Using URI:', MONGO_URI ? MONGO_URI.replace(/:[^:@]+@/, ':***@') : 'NOT SET');
    
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000,  // 30 seconds
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4  // Use IPv4 only (can help with DNS issues)
    });
    console.log('✅ Connected to MongoDB\n');

    let updatedCount = 0;
    let notFoundCount = 0;

    for (const email of TEST_USERS) {
      console.log(`\n🔍 Looking for user: ${email}`);
      
      // Find user by email (case-insensitive)
      const user = await User.findOne({ 
        email: { $regex: new RegExp(`^${email}$`, 'i') } 
      });

      if (!user) {
        console.log(`   ❌ User not found: ${email}`);
        notFoundCount++;
        continue;
      }

      console.log(`   ✅ Found user: ${user.email} (ID: ${user._id})`);

      // Update user with bypass values
      const updateResult = await User.updateOne(
        { _id: user._id },
        {
          $set: {
            // User verification bypass
            isUserVerified: true,
            rejection_reason: '',
            
            // Stripe verification bypass
            'stripe_verification.status': 'verified',
            'stripe_verification.verified_at': new Date(),
            'stripe_verification.verification_fee_paid': true,
            
            // Stripe Connect bypass
            'stripe_connect.account_status': 'active',
            'stripe_connect.onboarding_completed': true,
            'stripe_connect.payouts_enabled': true,
            'stripe_connect.charges_enabled': true,
            'stripe_connect.details_submitted': true
          }
        }
      );

      if (updateResult.modifiedCount > 0) {
        console.log(`   ✅ Updated successfully!`);
        updatedCount++;
      } else {
        console.log(`   ℹ️  No changes needed (already set)`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('  SUMMARY');
    console.log('='.repeat(60));
    console.log(`  ✅ Users updated: ${updatedCount}`);
    console.log(`  ❌ Users not found: ${notFoundCount}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run the script
bypassVerification();
