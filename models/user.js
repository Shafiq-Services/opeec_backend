const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // User name
  email: { type: String, required: true, unique: true, trim: true }, // User email
  password: { type: String, required: true }, // Encrypted password
  profile_image: { type: String, default: "" }, // Profile image URL
  created_at: { type: Date, default: Date.now }, // Record creation date
  favorite_equipments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Equipments' }], // List of favorite equipment IDs
  otp: { type: Number }, // OTP field
  otpExpiry: { type: Date }, // Expiry date for OTP
  isOtpVerified: { type: Boolean, default: false },
});

module.exports = mongoose.model('users', userSchema);
