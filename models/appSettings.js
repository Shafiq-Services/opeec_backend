const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema({
  privacy_policy_link: {
    type: String,
    default: '',
    trim: true
  },
  terms_conditions_link: {
    type: String,
    default: 'https://advyro.com/terms-and-conditions',
    trim: true
  },
  android_store_url: {
    type: String,
    default: 'https://play.google.com/store/apps/details?id=com.example.opeec',
    trim: true
  },
  ios_store_url: {
    type: String,
    default: 'https://apps.apple.com/app/id123456789',
    trim: true
  },
  share_message: {
    type: String,
    default: '🎉 Check out OPEEC - The ultimate equipment rental app!\\n\\n📱 Download now: {store_url}\\n\\n#OPEEC #EquipmentRental #RentAnything',
    trim: true
  },
  // Stripe Identity Verification Settings
  verification_fee: {
    type: Number,
    default: 2.00, // $2.00 in dollars
    min: 0
  },
  verification_title: {
    type: String,
    default: 'Identity Verification Required',
    trim: true
  },
  verification_description: {
    type: String,
    default: 'To ensure a safe and secure rental experience, we need to verify your identity. This is a one-time process.',
    trim: true
  }
}, { 
  timestamps: true // Using automatic timestamps instead of manual handling
});

module.exports = mongoose.models.AppSettings || mongoose.model('AppSettings', appSettingsSchema); 