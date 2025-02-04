const mongoose = require('mongoose');

// Admin Schema
const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  mobile: { type: String, required: true, unique: true },
  age: { type: Number, required: true },
  location: { type: String, default: "", trim: true },
  about: { type: String, default: "", trim: true },
  password: { type: String, required: true },
  profile_picture: { type: String, default: "" },
  created_at: { type: Date, default: Date.now },
  otp: { type: Number }, // OTP for password reset
  otpExpiry: { type: Date }, // OTP Expiry time
});

module.exports = mongoose.model('Admin', adminSchema);
