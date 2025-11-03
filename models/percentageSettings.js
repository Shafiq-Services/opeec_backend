const mongoose = require('mongoose');

const PercentageSettingSchema = new mongoose.Schema({
  adminFeePercentage: { type: Number, default: 10.0, min: 0, max: 100 },  // Platform/Admin Fee
  insurancePercentage: { type: Number, default: 8.0, min: 0, max: 100 },  // Base Insurance %
  dailyInsuranceMultiplier: { type: Number, default: 0.015, min: 0 },     // Daily Multiplier
  depositPercentage: { type: Number, default: 20.0, min: 0, max: 100 },   // Security Deposit %
  taxPercentage: { type: Number, default: 13.0, min: 0, max: 100 },       // Tax %
  stripeFeePercentage: { type: Number, default: 1.3, min: 0, max: 100 }   // Stripe transaction fee (for refunds)
}, { timestamps: true });

module.exports = mongoose.model('PercentageSetting', PercentageSettingSchema);
