const mongoose = require('mongoose');
const SellerWallet = require('../models/sellerWallet');
const TransactionLog = require('../models/transactionLog');
const WithdrawalRequest = require('../models/withdrawalRequest');

/**
 * Ensures a SellerWallet exists for a given seller
 * @param {string} sellerId - The seller's user ID
 * @returns {Promise<Object>} SellerWallet document
 */
async function ensureWallet(sellerId) {
  try {
    let wallet = await SellerWallet.findOne({ sellerId });
    
    if (!wallet) {
      wallet = new SellerWallet({
        sellerId,
        available_balance: 0,
        pending_balance: 0,
        total_balance: 0
      });
      await wallet.save();
    }
    
    return wallet;
  } catch (error) {
    console.error('Error ensuring wallet:', error);
    throw error;
  }
}

/**
 * Computes current balances from TransactionLog and updates SellerWallet
 * @param {string} sellerId - The seller's user ID
 * @returns {Promise<Object>} Updated balance information
 */
async function computeAndUpdateBalance(sellerId) {
  try {
    // Get all completed transactions for this seller
    const transactions = await TransactionLog.find({
      sellerId,
      status: 'completed'
    }).sort({ createdAt: 1 });

    // Calculate total balance from all transactions
    let totalBalance = 0;
    let lastTransactionId = null;

    for (const transaction of transactions) {
      totalBalance += transaction.amount;
      lastTransactionId = transaction._id;
    }

    // Get pending withdrawals (only requests that are still pending or approved, not rejected/paid)
    const pendingWithdrawals = await WithdrawalRequest.find({
      sellerId,
      status: { $in: ['Pending', 'Approved'] }
    });

    // Calculate pending balance (for display purposes only)
    const pendingBalance = pendingWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
    
    // Available balance is the total balance (WITHDRAW_REQUEST_HOLD transactions already reduce totalBalance)
    // No need to subtract pendingBalance again - that would be double deduction!
    const availableBalance = Math.max(0, totalBalance);

    // Update wallet with computed balances
    const wallet = await SellerWallet.findOneAndUpdate(
      { sellerId },
      {
        available_balance: Math.round(availableBalance * 100) / 100,
        pending_balance: Math.round(pendingBalance * 100) / 100,
        total_balance: Math.round(totalBalance * 100) / 100,
        last_transaction_id: lastTransactionId,
        balance_updated_at: new Date()
      },
      { new: true, upsert: true }
    );

    return {
      available_balance: wallet.available_balance,
      pending_balance: wallet.pending_balance,
      total_balance: wallet.total_balance
    };
  } catch (error) {
    console.error('Error computing balance:', error);
    throw error;
  }
}

/**
 * Creates a new transaction log entry
 * @param {Object} transactionData - Transaction details
 * @returns {Promise<Object>} Created transaction
 */
async function createTransaction(transactionData) {
  try {
    const {
      sellerId,
      type,
      amount,
      description,
      orderId = null,
      withdrawalRequestId = null,
      metadata = {}
    } = transactionData;

    const transaction = new TransactionLog({
      sellerId,
      type,
      amount,
      description,
      orderId,
      withdrawalRequestId,
      metadata,
      status: 'completed'
    });

    await transaction.save();
    
    // Update wallet balances after creating transaction
    await computeAndUpdateBalance(sellerId);
    
    return transaction;
  } catch (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }
}

/**
 * Gets unified history combining transactions and withdrawal requests
 * @param {string} sellerId - The seller's user ID
 * @param {Object} options - Pagination and filtering options
 * @returns {Promise<Object>} History data with pagination
 */
async function getUnifiedHistory(sellerId, options = {}) {
  try {
    const { page = 1, limit = 20, type = null } = options;
    const skip = (page - 1) * limit;

    // Build query filters
    const transactionFilter = { sellerId };
    const withdrawalFilter = { sellerId };
    
    if (type) {
      if (['ORDER_EARNING', 'PENALTY', 'REFUND', 'DEPOSIT_REFUND', 'SELLER_PAYOUT'].includes(type)) {
        transactionFilter.type = type;
        withdrawalFilter._id = { $exists: false }; // Exclude withdrawals if filtering by transaction type
      } else if (type === 'WITHDRAWAL_REQUEST') {
        transactionFilter._id = { $exists: false }; // Exclude transactions if filtering by withdrawal
      }
    }

    // Get transactions and withdrawal requests in parallel
    const [transactions, withdrawalRequests] = await Promise.all([
      TransactionLog.find(transactionFilter)
        .populate('orderId', 'rental_schedule equipment_id')
        .populate('orderId.equipment_id', 'title')
        .sort({ createdAt: -1 })
        .lean(),
      
      WithdrawalRequest.find(withdrawalFilter)
        .sort({ createdAt: -1 })
        .lean()
    ]);

    // Map transactions to unified format
    const mappedTransactions = transactions.map(transaction => ({
      _id: transaction._id,
      type: 'transaction',
      ui_type: mapTransactionTypeToUI(transaction.type),
      amount: transaction.amount,
      description: transaction.description,
      status: transaction.status,
      orderId: transaction.orderId?._id || null,
      order_title: transaction.orderId?.equipment_id?.title || null,
      created_at: transaction.createdAt,
      metadata: transaction.metadata
    }));

    // Map withdrawal requests to unified format
    const mappedWithdrawals = withdrawalRequests.map(withdrawal => ({
      _id: withdrawal._id,
      type: 'withdrawal_request',
      ui_type: 'Withdraw Request',
      amount: -withdrawal.amount, // Negative because it's money going out
      description: `Withdrawal request - ${withdrawal.payment_method.type}`,
      status: withdrawal.status.toLowerCase(),
      withdrawalRequestId: withdrawal._id,
      payment_method: withdrawal.payment_method.type,
      created_at: withdrawal.createdAt,
      reviewed_at: withdrawal.reviewed_at,
      approved_at: withdrawal.approved_at,
      paid_at: withdrawal.paid_at,
      rejected_at: withdrawal.rejected_at
    }));

    // Combine and sort by date
    const allHistory = [...mappedTransactions, ...mappedWithdrawals]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Apply pagination
    const paginatedHistory = allHistory.slice(skip, skip + limit);
    const totalItems = allHistory.length;
    const totalPages = Math.ceil(totalItems / limit);

    return {
      history: paginatedHistory,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
        items_per_page: limit,
        has_next: page < totalPages,
        has_previous: page > 1
      }
    };
  } catch (error) {
    console.error('Error getting unified history:', error);
    throw error;
  }
}

/**
 * Maps transaction types to UI-friendly names
 * @param {string} transactionType - Internal transaction type
 * @returns {string} UI-friendly type name
 */
function mapTransactionTypeToUI(transactionType) {
  const typeMap = {
    'ORDER_EARNING': 'Deposit',
    'PENALTY': 'Penalty',
    'REFUND': 'Refund',
    'DEPOSIT_REFUND': 'Deposit Refund',
    'SELLER_PAYOUT': 'Payment',
    'WITHDRAW_REQUEST_HOLD': 'Withdraw Hold',
    'WITHDRAW_REQUEST_RELEASE': 'Withdraw Release'
  };
  
  return typeMap[transactionType] || 'Transaction';
}

/**
 * Gets current wallet balances (from cached wallet or computed)
 * @param {string} sellerId - The seller's user ID
 * @param {boolean} forceRecompute - Whether to force balance recomputation
 * @returns {Promise<Object>} Current balance information
 */
async function getWalletBalances(sellerId, forceRecompute = false) {
  try {
    await ensureWallet(sellerId);
    
    if (forceRecompute) {
      return await computeAndUpdateBalance(sellerId);
    }
    
    const wallet = await SellerWallet.findOne({ sellerId });
    return {
      available_balance: wallet.available_balance,
      pending_balance: wallet.pending_balance,
      total_balance: wallet.total_balance
    };
  } catch (error) {
    console.error('Error getting wallet balances:', error);
    throw error;
  }
}

/**
 * Creates a withdrawal request hold transaction
 * @param {string} sellerId - The seller's user ID
 * @param {number} amount - Amount to hold
 * @param {string} withdrawalRequestId - ID of the withdrawal request
 * @returns {Promise<Object>} Created hold transaction
 */
async function createWithdrawalHold(sellerId, amount, withdrawalRequestId) {
  return await createTransaction({
    sellerId,
    type: 'WITHDRAW_REQUEST_HOLD',
    amount: -amount, // Negative because it reduces available balance
    description: 'Withdrawal request - funds held',
    withdrawalRequestId,
    metadata: {
      admin_notes: 'Funds held pending withdrawal approval'
    }
  });
}

/**
 * Releases a withdrawal request hold (when rejected)
 * @param {string} sellerId - The seller's user ID
 * @param {number} amount - Amount to release
 * @param {string} withdrawalRequestId - ID of the withdrawal request
 * @returns {Promise<Object>} Created release transaction
 */
async function releaseWithdrawalHold(sellerId, amount, withdrawalRequestId) {
  return await createTransaction({
    sellerId,
    type: 'WITHDRAW_REQUEST_RELEASE',
    amount: amount, // Positive because it restores available balance
    description: 'Withdrawal request rejected - funds released',
    withdrawalRequestId,
    metadata: {
      admin_notes: 'Funds released due to withdrawal rejection'
    }
  });
}

/**
 * Creates a seller payout transaction (when paid)
 * @param {string} sellerId - The seller's user ID
 * @param {number} amount - Amount paid out
 * @param {string} withdrawalRequestId - ID of the withdrawal request
 * @param {Object} paymentMetadata - Payment reference information
 * @returns {Promise<Object>} Created payout transaction
 */
async function createSellerPayout(sellerId, amount, withdrawalRequestId, paymentMetadata = {}) {
  return await createTransaction({
    sellerId,
    type: 'SELLER_PAYOUT',
    amount: -amount, // Negative because money is leaving the wallet
    description: 'Withdrawal completed - funds paid out',
    withdrawalRequestId,
    metadata: {
      admin_notes: 'Withdrawal successfully processed',
      ...paymentMetadata
    }
  });
}

module.exports = {
  ensureWallet,
  computeAndUpdateBalance,
  createTransaction,
  getUnifiedHistory,
  getWalletBalances,
  createWithdrawalHold,
  releaseWithdrawalHold,
  createSellerPayout,
  mapTransactionTypeToUI
};
