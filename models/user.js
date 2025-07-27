const mongoose = require('mongoose');

// Standardized Location Schema
const locationSchema = new mongoose.Schema({
  address: { type: String, trim: true },
  lat: { type: Number, min: -90, max: 90 },
  lng: { type: Number, min: -180, max: 180 }
}, { _id: false });

// OTP Schema for reusability
const otpSchema = new mongoose.Schema({
  otp: { type: Number },
  otpExpiry: { type: Date },
  isOtpVerified: { type: Boolean, default: false }
}, { _id: false });

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  profile_image: { type: String, default: "" },
  id_card_selfie: { type: String, default: "" },
  age: { type: Number, min: 0, max: 150 },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  DOB: { type: String },
  location: locationSchema,
  otpDetails: otpSchema,
  isUserVerified: { type: Boolean, default: false },
  rejection_reason: { type: String, default: "" },
  is_blocked: { type: Boolean, default: false },
  block_reason: { type: String, default: "" },
  fcm_token: { type: String, default: "" },
  favorite_equipments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' }]
}, { 
  timestamps: true // Replaces created_at with createdAt/updatedAt
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);