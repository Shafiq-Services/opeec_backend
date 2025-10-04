/**
 * User Data Migration Script
 * 
 * This script migrates existing users to the new schema by adding required fields:
 * - age (random between 18-65)
 * - gender (random: male, female, other)
 * - DOB (calculated from age)
 * - about (random description)
 * - location.address (random address)
 * - profile_image (default if empty)
 * - phone_number (random phone number)
 * 
 * Usage:
 * node scripts/migrateUserData.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection string
const MONGODB_URI = "mongodb+srv://opeecuser:4aGN7vh7e5nOz3aa@opeeccluster.pb7dv.mongodb.net/your_database?retryWrites=true&w=majority";

// Sample data arrays for random generation
const GENDERS = ['male', 'female', 'other'];

const SAMPLE_ADDRESSES = [
  "123 Main Street, New York, NY",
  "456 Oak Avenue, Los Angeles, CA", 
  "789 Pine Road, Chicago, IL",
  "321 Elm Street, Houston, TX",
  "654 Maple Drive, Phoenix, AZ",
  "987 Cedar Lane, Philadelphia, PA",
  "147 Birch Boulevard, San Antonio, TX",
  "258 Spruce Street, San Diego, CA",
  "369 Willow Way, Dallas, TX",
  "741 Ash Avenue, San Jose, CA",
  "852 Poplar Place, Austin, TX",
  "963 Hickory Hill, Jacksonville, FL",
  "159 Walnut Way, Fort Worth, TX",
  "357 Cherry Circle, Columbus, OH",
  "486 Peach Path, Charlotte, NC"
];

const SAMPLE_ABOUT_DESCRIPTIONS = [
  "I'm passionate about technology and love exploring new gadgets and equipment.",
  "Outdoor enthusiast who enjoys camping, hiking, and adventure sports.",
  "Professional photographer looking to rent quality equipment for projects.",
  "Small business owner who occasionally needs specialized tools and equipment.",
  "DIY enthusiast who loves working on home improvement projects.",
  "Event planner who frequently needs various equipment for different occasions.",
  "Freelance videographer always looking for the latest camera equipment.",
  "Construction worker who sometimes needs additional tools for specific jobs.",
  "Art student interested in renting creative equipment for projects.",
  "Fitness enthusiast who enjoys trying different workout equipment.",
  "Music lover who likes to experiment with different instruments and audio gear.",
  "Chef who enjoys cooking and sometimes needs specialized kitchen equipment.",
  "Traveler who prefers renting equipment rather than buying for trips.",
  "Entrepreneur working on various projects that require different tools.",
  "Student studying engineering and interested in hands-on equipment experience."
];

const DEFAULT_PROFILE_IMAGES = [
  "https://via.placeholder.com/150/FF6B6B/FFFFFF?text=User",
  "https://via.placeholder.com/150/4ECDC4/FFFFFF?text=User",
  "https://via.placeholder.com/150/45B7D1/FFFFFF?text=User",
  "https://via.placeholder.com/150/96CEB4/FFFFFF?text=User",
  "https://via.placeholder.com/150/FFEAA7/FFFFFF?text=User",
  "https://via.placeholder.com/150/DDA0DD/FFFFFF?text=User",
  "https://via.placeholder.com/150/98D8C8/FFFFFF?text=User",
  "https://via.placeholder.com/150/F7DC6F/FFFFFF?text=User"
];

const SAMPLE_PHONE_NUMBERS = [
  "+1-555-0123",
  "+1-555-0124", 
  "+1-555-0125",
  "+1-555-0126",
  "+1-555-0127",
  "+1-555-0128",
  "+1-555-0129",
  "+1-555-0130",
  "+1-555-0131",
  "+1-555-0132",
  "+1-555-0133",
  "+1-555-0134",
  "+1-555-0135",
  "+1-555-0136",
  "+1-555-0137"
];

/**
 * Generate random integer between min and max (inclusive)
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get random element from array
 */
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate DOB string from age
 */
function generateDOBFromAge(age) {
  const currentYear = new Date().getFullYear();
  const birthYear = currentYear - age;
  const month = randomInt(1, 12).toString().padStart(2, '0');
  const day = randomInt(1, 28).toString().padStart(2, '0'); // Use 28 to avoid month-specific day issues
  return `${birthYear}-${month}-${day}`;
}

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

/**
 * Define User schema (matching the current model)
 */
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
  favorite_equipments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' }]
}, { 
  timestamps: true
});

const User = mongoose.model('User', userSchema);

/**
 * Migrate existing users
 */
async function migrateUsers() {
  try {
    console.log('🔍 Finding users that need migration...');
    
    // Find users missing any of the new required fields
    const usersToMigrate = await User.find({
      $or: [
        { age: { $exists: false } },
        { gender: { $exists: false } },
        { DOB: { $exists: false } },
        { about: { $exists: false } },
        { location: { $exists: false } },
        { profile_image: { $exists: false } },
        { profile_image: "" },
        { profile_image: null },
        { phone_number: { $exists: false } },
        { phone_number: "" },
        { phone_number: null }
      ]
    });

    console.log(`📊 Found ${usersToMigrate.length} users that need migration`);

    if (usersToMigrate.length === 0) {
      console.log('✅ No users need migration!');
      return;
    }

    let migratedCount = 0;
    const errors = [];

    for (const user of usersToMigrate) {
      try {
        console.log(`🔄 Migrating user: ${user.name} (${user.email})`);

        // Generate random data
        const age = randomInt(18, 65);
        const gender = randomChoice(GENDERS);
        const DOB = generateDOBFromAge(age);
        const about = randomChoice(SAMPLE_ABOUT_DESCRIPTIONS);
        const address = randomChoice(SAMPLE_ADDRESSES);
        const phone_number = randomChoice(SAMPLE_PHONE_NUMBERS);
        const profile_image = user.profile_image && user.profile_image.trim() !== "" 
          ? user.profile_image 
          : randomChoice(DEFAULT_PROFILE_IMAGES);

        // Update user with new fields
        const updateData = {
          age: user.age || age,
          gender: user.gender || gender,
          DOB: user.DOB || DOB,
          about: user.about || about,
          phone_number: user.phone_number || phone_number,
          profile_image: profile_image,
          location: user.location || {
            address: address,
            lat: 0.0,
            lng: 0.0
          }
        };

        await User.findByIdAndUpdate(user._id, updateData, { new: true });
        
        migratedCount++;
        console.log(`✅ Successfully migrated: ${user.name}`);

      } catch (error) {
        console.error(`❌ Error migrating user ${user.name}:`, error.message);
        errors.push({ user: user.name, email: user.email, error: error.message });
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migratedCount} users`);
    console.log(`❌ Failed migrations: ${errors.length} users`);

    if (errors.length > 0) {
      console.log('\n❌ Migration Errors:');
      errors.forEach(err => {
        console.log(`- ${err.user} (${err.email}): ${err.error}`);
      });
    }

    console.log('\n🎉 User migration completed!');

  } catch (error) {
    console.error('❌ Migration process failed:', error);
    throw error;
  }
}

/**
 * Verify migration results
 */
async function verifyMigration() {
  try {
    console.log('\n🔍 Verifying migration results...');

    const totalUsers = await User.countDocuments();
    const usersWithAllFields = await User.countDocuments({
      age: { $exists: true, $ne: null },
      gender: { $exists: true, $ne: null },
      DOB: { $exists: true, $ne: null },
      about: { $exists: true, $ne: null },
      location: { $exists: true, $ne: null },
      profile_image: { $exists: true, $ne: null, $ne: "" },
      phone_number: { $exists: true, $ne: null, $ne: "" }
    });

    console.log(`📊 Total users: ${totalUsers}`);
    console.log(`✅ Users with all required fields: ${usersWithAllFields}`);
    console.log(`❌ Users still missing fields: ${totalUsers - usersWithAllFields}`);

    if (totalUsers === usersWithAllFields) {
      console.log('🎉 All users have been successfully migrated!');
    } else {
      console.log('⚠️  Some users still need migration');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('🚀 OPEEC User Data Migration Script');
    console.log('===================================');
    
    // Connect to database
    await connectDB();
    
    // Run migration
    await migrateUsers();
    
    // Verify results
    await verifyMigration();
    
    console.log('\n✅ Migration script completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Handle script execution
if (require.main === module) {
  main();
}

module.exports = { migrateUsers, verifyMigration };
