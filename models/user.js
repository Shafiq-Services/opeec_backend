const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // User name
  email: { type: String, required: true, unique: true, trim: true }, // User email
  password: { type: String, required: true }, // Encrypted password
  profile_image: { type: String, default: "" }, // Profile image URL
  id_card_selfie: { type: String, default: "" }, // ID card image URL
  created_at: { type: Date, default: Date.now }, // Record creation date
  favorite_equipments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Equipments' }], // List of favorite equipment IDs
  otp: { type: Number }, // OTP field
  otpExpiry: { type: Date }, // Expiry date for OTP
  isOtpVerified: { type: Boolean, default: false },
  isUserVerified: { type: Boolean, default: false },
  rejection_reason: { type: String, default: "" }, // Rejection reason for user verification
  is_blocked: { type: Boolean, default: false }, // User blocking status
  block_reason: { type: String, default: "" }, // Reason for blocking the user
  fcm_token: { type: String, default: "" }, // FCM token for push notifications
});

// Prevent model overwrite error
module.exports = mongoose.models.users || mongoose.model('users', userSchema);