const mongoose = require('mongoose');

// OTP Schema for reusability
const otpSchema = new mongoose.Schema({
  otp: { type: Number },
  otpExpiry: { type: Date }
}, { _id: false });

// Admin Schema
const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  mobile: { type: String, required: true, unique: true },
  age: { type: Number, required: true },
  phone_number: { type: String},
  location: { type: String, default: "", trim: true },
  about: { type: String, default: "", trim: true },
  password: { type: String, required: true },
  profile_picture: { type: String, default: "" },
  fcm_token: { type: String, default: "" },
  otpDetails: otpSchema
}, { 
  timestamps: true // Replaces created_at with createdAt/updatedAt
});

module.exports = mongoose.model('Admin', adminSchema);
