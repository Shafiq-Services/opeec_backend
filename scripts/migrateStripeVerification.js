const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Migration Script: Add Stripe Verification to Existing Users
 * 
 * This script adds the stripe_verification field to all existing users
 * with default status 'not_verified'
 * 
 * Run: node scripts/migrateStripeVerification.js
 */

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Define User schema (matching the current model)
const locationSchema = new mongoose.Schema({
  address: { type: String, required: true, trim: true },
  lat: { type: Number, min: -90, max: 90, default: 0.0 },
  lng: { type: Number, min: -180, max: 180, default: 0.0 }
}, { _id: false });

const otpSchema = new mongoose.Schema({
  otp: { type: Number },
  otpExpiry: { type: Date },
  isOtpVerified: { type: Boolean, default: false }
}, { _id: false });

const stripeVerificationSchema = new mongoose.Schema({
  status: { 
    type: String, 
    enum: ['not_verified', 'pending', 'verified', 'failed'],
    default: 'not_verified'
  },
  session_id: { type: String, default: null },
  verification_reference: { type: String, default: null },
  attempts: [{
    session_id: { type: String },
    status: { type: String },
    created_at: { type: Date },
    completed_at: { type: Date },
    failure_reason: { type: String }
  }],
  verified_at: { type: Date, default: null },
  last_attempt_at: { type: Date, default: null },
  verification_fee_paid: { type: Boolean, default: false },
  payment_intent_id: { type: String, default: null }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  phone_number: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  profile_image: { type: String, required: true },
  age: { type: Number, required: true, min: 0, max: 150 },
  gender: { type: String, required: true, enum: ['male', 'female', 'other'] },
  DOB: { type: String, required: true },
  about: { type: String, required: true, trim: true },
  location: { type: locationSchema, required: true },
  otpDetails: otpSchema,
  isUserVerified: { type: Boolean, default: true },
  rejection_reason: { type: String, default: "" },
  is_blocked: { type: Boolean, default: false },
  block_reason: { type: String, default: "" },
  fcm_token: { type: String, default: "" },
  favorite_equipments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' }],
  stripe_verification: { type: stripeVerificationSchema, default: () => ({}) }
}, { 
  timestamps: true
});

const User = mongoose.model('User', userSchema);

/**
 * Migrate existing users to add stripe_verification field
 */
async function migrateUsers() {
  try {
    console.log('🔄 Starting migration: Adding stripe_verification to users...\n');

    // Find all users that don't have stripe_verification field
    const usersWithoutVerification = await User.find({
      $or: [
        { stripe_verification: { $exists: false } },
        { stripe_verification: null }
      ]
    });

    console.log(`📊 Found ${usersWithoutVerification.length} users without stripe_verification field\n`);

    if (usersWithoutVerification.length === 0) {
      console.log('✅ No users need migration. All users already have stripe_verification field.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const user of usersWithoutVerification) {
      try {
        // Add default stripe_verification object
        user.stripe_verification = {
          status: 'not_verified',
          session_id: null,
          verification_reference: null,
          attempts: [],
          verified_at: null,
          last_attempt_at: null,
          verification_fee_paid: false,
          payment_intent_id: null
        };

        await user.save();
        successCount++;
        
        console.log(`✅ Migrated user: ${user.email} (${user._id})`);
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating user ${user.email}:`, error.message);
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   Total users found: ${usersWithoutVerification.length}`);
    console.log(`   ✅ Successfully migrated: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  }
}

/**
 * Verify migration results
 */
async function verifyMigration() {
  try {
    console.log('\n🔍 Verifying migration results...\n');

    const totalUsers = await User.countDocuments({});
    const usersWithVerification = await User.countDocuments({
      'stripe_verification': { $exists: true }
    });
    const usersWithoutVerification = await User.countDocuments({
      $or: [
        { stripe_verification: { $exists: false } },
        { stripe_verification: null }
      ]
    });

    console.log('📊 Verification Results:');
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Users with stripe_verification: ${usersWithVerification}`);
    console.log(`   Users without stripe_verification: ${usersWithoutVerification}`);

    if (usersWithoutVerification === 0) {
      console.log('\n✅ Migration verified successfully! All users have stripe_verification field.');
    } else {
      console.log('\n⚠️  Warning: Some users still missing stripe_verification field.');
    }

    // Show sample user
    const sampleUser = await User.findOne({}).select('email stripe_verification');
    if (sampleUser) {
      console.log('\n📄 Sample user verification data:');
      console.log(`   Email: ${sampleUser.email}`);
      console.log(`   Verification Status: ${sampleUser.stripe_verification?.status || 'N/A'}`);
    }

  } catch (error) {
    console.error('❌ Verification error:', error);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 STRIPE VERIFICATION MIGRATION SCRIPT\n');
    console.log('='.repeat(60));
    console.log('\n');

    await connectDB();
    await migrateUsers();
    await verifyMigration();

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration completed successfully!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
main();


