const mongoose = require('mongoose');

// WithdrawalRequest Schema - Records seller payout requests
const withdrawalRequestSchema = new mongoose.Schema({
  sellerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  
  // Requested withdrawal amount
  amount: { 
    type: Number, 
    required: true, 
    min: 0.01  // Minimum withdrawal amount
  },
  
  // Request status workflow
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Paid', 'Rejected'],
    default: 'Pending',
    required: true,
    index: true
  },
  
  // Payment method information (optional - handled via chat)
  payment_method: {
    type: {
      type: String,
      enum: ['bank_transfer', 'paypal', 'stripe_express', 'other'],
      required: false,
      default: 'other'
    },
    
    // Payment details (optional - handled via chat between admin and user)
    details: {
      account_number: { type: String },
      routing_number: { type: String },
      account_holder_name: { type: String },
      bank_name: { type: String },
      paypal_email: { type: String },
      stripe_account_id: { type: String },
      other_details: { type: String }
    }
  },
  
  // Admin workflow tracking
  reviewed_by_admin_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Admin',
    default: null
  },
  
  reviewed_at: { 
    type: Date, 
    default: null 
  },
  
  // Rejection reason if applicable
  rejection_reason: { 
    type: String, 
    default: '',
    trim: true
  },
  
  // External payment reference
  external_reference: {
    transaction_id: { type: String },
    receipt_url: { type: String },
    screenshot_url: { type: String },
    notes: { type: String }
  },
  
  // Timestamps for different status changes
  approved_at: { type: Date, default: null },
  paid_at: { type: Date, default: null },
  rejected_at: { type: Date, default: null },
  
  // Related transaction log entries for holds/releases
  hold_transaction_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'TransactionLog',
    default: null
  },
  
  payout_transaction_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'TransactionLog',
    default: null
  }
}, { 
  timestamps: true 
});

// Compound indexes for efficient queries
withdrawalRequestSchema.index({ sellerId: 1, createdAt: -1 });
withdrawalRequestSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 });
withdrawalRequestSchema.index({ reviewed_by_admin_id: 1, reviewed_at: -1 });

module.exports = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
