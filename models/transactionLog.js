const mongoose = require('mongoose');

// TransactionLog Schema - Records all money movements for sellers
const transactionLogSchema = new mongoose.Schema({
  sellerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  
  // Transaction type determines the nature of money movement
  type: { 
    type: String, 
    required: true,
    enum: [
      'ORDER_EARNING',           // Positive: Seller earnings from completed rental
      'PENALTY',                 // Negative: Penalty deducted from seller
      'REFUND',                  // Negative: Refund processed (seller loses money)
      'DEPOSIT_REFUND',          // Negative: Deposit refund to renter
      'SELLER_PAYOUT',           // Negative: Money paid out to seller
      'WITHDRAW_REQUEST_HOLD',   // Negative: Funds held for withdrawal request
      'WITHDRAW_REQUEST_RELEASE' // Positive: Funds released back from hold
    ],
    index: true
  },
  
  // Amount - positive for credits to seller, negative for debits
  amount: { 
    type: Number, 
    required: true 
  },
  
  // Status of the transaction
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'completed',
    index: true
  },
  
  // Reference information
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order', 
    default: null 
  },
  
  withdrawalRequestId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'WithdrawalRequest', 
    default: null 
  },
  
  // Description for transaction history
  description: { 
    type: String, 
    required: true,
    trim: true
  },
  
  // Additional metadata
  metadata: {
    // Original order breakdown for audit trail
    order_breakdown: {
      rental_fee: { type: Number },
      platform_fee: { type: Number },
      tax_amount: { type: Number },
      insurance_amount: { type: Number },
      deposit_amount: { type: Number },
      total_amount: { type: Number }
    },
    
    // External references
    stripe_payment_intent_id: { type: String },
    stripe_refund_id: { type: String },
    admin_notes: { type: String },
    
    // Processing details
    processed_by_admin_id: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Admin' 
    }
  }
}, { 
  timestamps: true 
});

// Compound indexes for efficient queries
transactionLogSchema.index({ sellerId: 1, createdAt: -1 });
transactionLogSchema.index({ sellerId: 1, type: 1, createdAt: -1 });
transactionLogSchema.index({ orderId: 1 });
transactionLogSchema.index({ withdrawalRequestId: 1 });

module.exports = mongoose.model('TransactionLog', transactionLogSchema);
