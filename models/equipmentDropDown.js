const mongoose = require("mongoose");

const EquipmentDropdownSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true,
      enum: ['advanceNotice', 'minimumRentalDuration', 'maximumRentalDuration'],
    },
    unit: {
      type: String,
      required: true,
      enum: ['hours', 'days', 'weeks', 'months'],
    },
    options: [
      {
        label: { type: String, required: true },
        value: { type: Number, required: true },
        recommended: { type: Boolean, default: false }
      }
    ]
  }, { timestamps: true });
  
  const EquipmentDropdown = mongoose.model('EquipmentDropdown', EquipmentDropdownSchema);
  
  module.exports = EquipmentDropdown;
  