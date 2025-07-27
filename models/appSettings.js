const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema({
  privacy_policy_link: {
    type: String,
    default: '',
    trim: true
  },
  terms_conditions_link: {
    type: String,
    default: '',
    trim: true
  }
}, { 
  timestamps: true // Using automatic timestamps instead of manual handling
});

module.exports = mongoose.models.AppSettings || mongoose.model('AppSettings', appSettingsSchema); 