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

  // Pricing breakdown - all amounts stored from frontend calculations
  rental_fee: { type: Number, required: true },
  platform_fee: { type: Number, required: true },
  tax_amount: { type: Number, required: true },
  insurance_amount: { type: Number, default: 0 },
  deposit_amount: { type: Number, default: 0 },
  total_amount: { type: Number, required: true },
  subtotal: { type: Number, required: true },

  // Insurance or Deposit (only one applies per order)
  security_option: {
    insurance: { type: Boolean, default: false },     // true = insurance, false = deposit
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

  // Stripe Connect - Automated payout tracking
  stripe_payout: {
    payment_intent_id: { type: String, default: "" },
    transfer_id: { type: String, default: "" },
    transfer_status: { 
      type: String, 
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: null
    },
    transfer_amount: { type: Number, default: 0 }, // Amount transferred to owner
    transfer_triggered_at: { type: Date, default: null },
    transfer_completed_at: { type: Date, default: null },
    transfer_failure_reason: { type: String, default: "" },
    destination_account_id: { type: String, default: "" } // Owner's Stripe Connect account
  },

  // Stripe Payment - Customer payment collection and refund tracking
  stripe_payment: {
    payment_intent_id: { type: String, default: "" },
    payment_method_id: { type: String, default: "" }, // For off-session late penalty charges
    customer_id: { type: String, default: "" },
    payment_status: { 
      type: String, 
      enum: ['pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'],
      default: 'pending'
    },
    amount_captured: { type: Number, default: 0 },
    payment_captured_at: { type: Date, default: null },
    refund_id: { type: String, default: "" },
    refund_amount: { type: Number, default: 0 },
    refund_status: { type: String, default: "" },
    refund_processed_at: { type: Date, default: null },
    late_penalty_charges: [{ 
      charge_id: { type: String },
      amount: { type: Number },
      charged_at: { type: Date },
      status: { type: String }
    }]
  }
}, { 
  timestamps: true // Replaces created_at/updated_at with createdAt/updatedAt
});

module.exports = mongoose.model('Order', orderSchema);
