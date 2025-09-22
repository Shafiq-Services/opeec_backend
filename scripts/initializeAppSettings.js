const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const AppSettings = require('../models/appSettings');

/**
 * Initialize App Settings with Default URLs
 * Run this script to populate the database with default app configuration
 */
async function initializeAppSettings() {
  try {
    console.log('🚀 Connecting to MongoDB...');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/opeec';
    await mongoose.connect(mongoUri);
    
    console.log('✅ Connected to MongoDB');

    // Check if settings already exist
    const existingSettings = await AppSettings.findOne();
    
    if (existingSettings) {
      console.log('📋 App settings already exist. Current values:');
      console.log('   Terms & Conditions:', existingSettings.terms_conditions_link);
      console.log('   Privacy Policy:', existingSettings.privacy_policy_link);
      console.log('   Android Store:', existingSettings.android_store_url);
      console.log('   iOS Store:', existingSettings.ios_store_url);
      console.log('   Share Message:', existingSettings.share_message);
      
      console.log('\n🔄 Updating with new default values...');
      
      // Update existing settings with new fields
      existingSettings.terms_conditions_link = 'https://advyro.com/terms-and-conditions';
      existingSettings.android_store_url = 'https://play.google.com/store/apps/details?id=com.example.opeec';
      existingSettings.ios_store_url = 'https://apps.apple.com/app/id123456789';
      existingSettings.share_message = '🎉 Check out OPEEC - The ultimate equipment rental app!\\n\\n📱 Download now: {store_url}\\n\\n#OPEEC #EquipmentRental #RentAnything';
      
      await existingSettings.save();
      console.log('✅ Settings updated successfully!');
      
    } else {
      console.log('📝 Creating new app settings with default values...');
      
      // Create new settings
      const newSettings = new AppSettings({
        privacy_policy_link: 'https://advyro.com/privacy',
        terms_conditions_link: 'https://advyro.com/terms-and-conditions',
        android_store_url: 'https://play.google.com/store/apps/details?id=com.example.opeec',
        ios_store_url: 'https://apps.apple.com/app/id123456789',
        share_message: '🎉 Check out OPEEC - The ultimate equipment rental app!\\n\\n📱 Download now: {store_url}\\n\\n#OPEEC #EquipmentRental #RentAnything'
      });
      
      await newSettings.save();
      console.log('✅ New settings created successfully!');
    }

    // Display final settings
    const finalSettings = await AppSettings.findOne();
    console.log('\n📱 Final App Settings:');
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│                        APP CONFIGURATION                        │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│ Terms & Conditions: ${finalSettings.terms_conditions_link.padEnd(40)} │`);
    console.log(`│ Privacy Policy:     ${finalSettings.privacy_policy_link.padEnd(40)} │`);
    console.log(`│ Android Store:      ${finalSettings.android_store_url.padEnd(40)} │`);
    console.log(`│ iOS Store:          ${finalSettings.ios_store_url.padEnd(40)} │`);
    console.log('│                                                                 │');
    console.log('│ Share Message Template:                                         │');
    console.log(`│ ${finalSettings.share_message.substring(0, 63).padEnd(63)} │`);
    console.log('└─────────────────────────────────────────────────────────────────┘');

    console.log('\n🎯 Usage Notes:');
    console.log('   • Use GET /api/admin/settings to retrieve all settings');
    console.log('   • Use PUT /api/admin/settings to update any setting');
    console.log('   • Share message {store_url} will be replaced with appropriate store link');
    console.log('   • All URLs are validated for proper format');

  } catch (error) {
    console.error('❌ Error initializing app settings:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the initialization
if (require.main === module) {
  initializeAppSettings();
}

module.exports = { initializeAppSettings };
