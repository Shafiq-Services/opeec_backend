const mongoose = require('mongoose');

// SellerWallet Schema - Cached balance information for each seller
const sellerWalletSchema = new mongoose.Schema({
  sellerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true,
    index: true
  },
  
  // Cached balance amounts (computed from TransactionLog)
  available_balance: { 
    type: Number, 
    default: 0, 
    min: 0  // Available balance cannot be negative
  },
  
  pending_balance: { 
    type: Number, 
    default: 0, 
    min: 0  // Pending balance cannot be negative
  },
  
  total_balance: { 
    type: Number, 
    default: 0, 
    min: 0  // Total balance cannot be negative
  },
  
  // Last transaction processed for balance computation
  last_transaction_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'TransactionLog', 
    default: null 
  },
  
  // Balance last updated timestamp
  balance_updated_at: { 
    type: Date, 
    default: Date.now,
    index: true
  }
}, { 
  timestamps: true 
});

// Compound index for efficient queries
sellerWalletSchema.index({ sellerId: 1, balance_updated_at: -1 });

module.exports = mongoose.model('SellerWallet', sellerWalletSchema);
