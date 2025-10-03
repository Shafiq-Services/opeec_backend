const mongoose = require('mongoose');

// Standardized Location Schema
const locationSchema = new mongoose.Schema({
  address: { type: String, required: true, trim: true },
  lat: { type: Number, min: -90, max: 90, default: 0.0 },
  lng: { type: Number, min: -180, max: 180, default: 0.0 }
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
  profile_image: { type: String, required: true },
  age: { type: Number, required: true, min: 0, max: 150 },
  gender: { type: String, required: true, enum: ['male', 'female'] },
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
  timestamps: true // Replaces created_at with createdAt/updatedAt
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);