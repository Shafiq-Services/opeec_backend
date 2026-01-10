const mongoose = require('mongoose');

// Standardized Location Schema
const locationSchema = new mongoose.Schema({
  address: { type: String, required: false, trim: true, default: '' }, // Optional - Apple App Store compliance
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
    enum: ['not_verified', 'pending', 'verified', 'failed', 'requires_input'],
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
  age: { type: Number, required: false, min: 0, max: 150, default: null }, // Optional - Apple App Store compliance
  gender: { type: String, required: false, enum: ['male', 'female', 'other', ''], default: '' }, // Optional - Apple App Store compliance
  DOB: { type: String, default: "", trim: true }, // Optional - empty string by default
  about: { type: String, default: "", trim: true }, // Optional - empty string by default
  location: { type: locationSchema, required: false, default: { address: '', lat: 0.0, lng: 0.0 } }, // Optional - Apple App Store compliance
  otpDetails: otpSchema,
  isUserVerified: { type: Boolean, default: true },
  rejection_reason: { type: String, default: "" },
  is_blocked: { type: Boolean, default: false },
  block_reason: { type: String, default: "" },
  fcm_token: { type: String, default: "" },
  favorite_equipments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' }],
  blocked_users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Users blocked by this user (Apple App Store compliance)
  stripe_verification: { type: stripeVerificationSchema, default: () => ({}) },
  
  // Stripe Customer ID - For payment collection (renters)
  stripe_customer_id: { type: String, default: "" },
  
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
    onboarding_url_created_at: { type: Date, default: null }, // Track when link was created (links expire in 5 minutes)
    last_updated: { type: Date, default: null }
  }
}, { 
  timestamps: true // Replaces created_at with createdAt/updatedAt
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);