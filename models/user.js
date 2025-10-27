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

// Stripe Verification Schema
const stripeVerificationSchema = new mongoose.Schema({
  status: { 
    type: String, 
    enum: ['not_verified', 'pending', 'verified', 'failed'],
    default: 'not_verified'
  },
  session_id: { type: String, default: "" },
  verification_reference: { type: String, default: "" },
  attempts: [{
    session_id: { type: String },
    status: { type: String },
    created_at: { type: Date },
    completed_at: { type: Date },
    failure_reason: { type: String }
  }],
  verified_at: { type: Date, default: "" },
  last_attempt_at: { type: Date, default: "" },
  verification_fee_paid: { type: Boolean, default: false },
  payment_intent_id: { type: String, default: "" }
}, { _id: false });

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  phone_number: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  profile_image: { type: String, required: true },
  age: { type: Number, required: true, min: 0, max: 150 },
  gender: { type: String, required: true, enum: ['male', 'female', 'other'] },
  DOB: { type: String, default: "", trim: true }, // Optional - empty string by default
  about: { type: String, default: "", trim: true }, // Optional - empty string by default
  location: { type: locationSchema, required: true },
  otpDetails: otpSchema,
  isUserVerified: { type: Boolean, default: true },
  rejection_reason: { type: String, default: "" },
  is_blocked: { type: Boolean, default: false },
  block_reason: { type: String, default: "" },
  fcm_token: { type: String, default: "" },
  favorite_equipments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' }],
  stripe_verification: { type: stripeVerificationSchema, default: () => ({}) },
  
  // Stripe Connect - For equipment owners to receive automated payouts
  stripe_connect: {
    account_id: { type: String, default: "" },
    account_status: { 
      type: String, 
      enum: ['not_connected', 'pending', 'active', 'disabled'],
      default: 'not_connected'
    },
    onboarding_completed: { type: Boolean, default: false },
    charges_enabled: { type: Boolean, default: false },
    payouts_enabled: { type: Boolean, default: false },
    details_submitted: { type: Boolean, default: false },
    onboarding_url: { type: String, default: "" },
    last_updated: { type: Date, default: null }
  }
}, { 
  timestamps: true // Replaces created_at with createdAt/updatedAt
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);