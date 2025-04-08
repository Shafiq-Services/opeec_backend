const mongoose = require('mongoose');

const PercentageSettingSchema = new mongoose.Schema({
  adminFeePercentage: { type: Number, default: 10.0, min: 0, max: 100 },
  insurancePercentage: { type: Number, default: 7.0, min: 0, max: 100 },
  taxPercentage: { type: Number, default: 13.0, min: 0, max: 100 }
}, { timestamps: true });

module.exports = mongoose.model('PercentageSetting', PercentageSettingSchema);
