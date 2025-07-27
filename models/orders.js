const mongoose = require('mongoose');

// Standardized Location Schema
const locationSchema = new mongoose.Schema({
  address: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true }
}, { _id: false });

// Order Schema
const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment', required: true },

  rental_schedule: {
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true }
  },

  location: locationSchema,

  // Only store base rental fee - others calculated dynamically from percentageSettings
  rental_fee: { type: Number, required: true },

  // Insurance or Deposit (only one applies per order)
  security_option: {
    insurance: { type: Boolean, default: false },     // true = insurance, false = deposit
    // Amounts calculated dynamically from percentageSettings and rental_fee
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
  }
}, { 
  timestamps: true // Replaces created_at/updated_at with createdAt/updatedAt
});

module.exports = mongoose.model('Order', orderSchema);
