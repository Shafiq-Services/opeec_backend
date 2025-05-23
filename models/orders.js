const mongoose = require('mongoose');

// Order Schema
const orderSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  equipment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipments', required: true },

  rental_schedule: {
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true }
  },

  location: {
    address: { type: String, required: true },
    lat: { type: Number, required: true },
    long: { type: Number, required: true }
  },

  rental_fee: { type: Number, required: true },
  platform_fee: { type: Number, required: true },
  tax_amount: { type: Number, required: true },
  total_amount: { type: Number, required: true },

  // Insurance or Deposit (only one applies per order)
  security_option: {
    insurance: { type: Boolean, default: false },     // true = insurance, false = deposit
    insurance_amount: { type: Number, default: 0 },    // calculated insurance fee
    deposit_amount: { type: Number, default: 0 }       // calculated deposit amount (refundable)
  },

  cancellation: {
    is_cancelled: { type: Boolean, default: false },
    reason: { type: String },
    cancelled_at: { type: Date }
  },

  rental_status: {
    type: String,
    enum: ['Booked', 'Delivered', 'Ongoing', 'Returned', 'Cancelled', 'Finished', 'Late'],
    default: 'Booked'
  },

  return_status: {
    is_returned: { type: Boolean, default: false },
    returned_at: { type: Date }
  },

  owner_images: [{ type: String }],
  buyer_images: [{ type: String }],

  penalty_apply: { type: Boolean, default: true },
  penalty_amount: { type: Number, default: 0 },
  status_change_timestamp: { type: Date, default: Date.now },

  buyer_review: {
    comment: { type: String },
    rating: { type: Number, min: 0, max: 5, default: 0 }
  },
  created_at: { type: Date, default: Date.now }, // Order creation timestamp
  updated_at: { type: Date, default: Date.now }, // Last updated timestamp
});

module.exports = mongoose.model('Orders', orderSchema);
