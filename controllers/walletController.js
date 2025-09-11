const { getWalletBalances, getUnifiedHistory, ensureWallet } = require('../utils/walletService');
const WithdrawalRequest = require('../models/withdrawalRequest');

/**
 * Get unified wallet information including balance, pending withdrawals, and history
 * GET /wallet
 */
exports.getWalletInfo = async (req, res) => {
  try {
    const sellerId = req.userId; // Extract from JWT middleware
    const { limit = 50 } = req.query; // Get more history for mobile, no pagination needed

    console.log(`📊 Getting unified wallet info for seller: ${sellerId}`);

    // Ensure wallet exists and get current balances
    await ensureWallet(sellerId);
    const balances = await getWalletBalances(sellerId);

    // Get withdrawal requests (pending and history)
    const withdrawalRequests = await WithdrawalRequest.find({ sellerId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    // Separate pending and completed withdrawals
    const pendingWithdrawals = withdrawalRequests
      .filter(request => request.status === 'Pending')
      .map(request => ({
        type: 'Withdraw Request',
        amount: -request.amount, // Negative for withdrawal
        date: request.createdAt,
        time: new Date(request.createdAt).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        status: request.status
      }));

    // Format completed withdrawals for history
    const withdrawalHistory = withdrawalRequests
      .filter(request => ['Approved', 'Paid', 'Rejected'].includes(request.status))
      .map(request => ({
        type: request.status, // 'Approved', 'Rejected', etc.
        amount: -request.amount, // Negative for withdrawal
        date: request.createdAt,
        time: new Date(request.createdAt).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        transaction_id: request.external_reference?.transaction_id || '',
        reason: request.rejection_reason || '',
        status: request.status
      }));

    console.log(`✅ Unified wallet info retrieved - Available Balance: $${balances.available_balance}, Total: $${balances.total_balance}, Pending: ${pendingWithdrawals.length}, History: ${withdrawalHistory.length}`);

    // Return unified structure matching the screenshot
    res.status(200).json({
      total_balance: balances.available_balance, // Show available balance (excluding pending withdrawals)
      pending: pendingWithdrawals, // Pending withdrawal requests
      history: withdrawalHistory // Approved/Rejected withdrawal history
    });

  } catch (error) {
    console.error('❌ Error getting unified wallet info:', error);
    res.status(500).json({ 
      message: 'Error retrieving wallet information', 
      error: error.message 
    });
  }
};

/**
 * Refresh wallet balances (force recomputation)
 * POST /wallet/refresh
 */
exports.refreshWallet = async (req, res) => {
  try {
    const sellerId = req.userId;

    console.log(`🔄 Refreshing wallet balances for seller: ${sellerId}`);

    // Force recompute balances from transaction log
    const balances = await getWalletBalances(sellerId, true);

    console.log(`✅ Wallet refreshed - Available Balance: $${balances.available_balance}, Total Balance: $${balances.total_balance}`);

    res.status(200).json({
      total_balance: balances.available_balance // Show available balance (excluding pending withdrawals)
    });

  } catch (error) {
    console.error('❌ Error refreshing wallet:', error);
    res.status(500).json({ 
      message: 'Error refreshing wallet balances', 
      error: error.message 
    });
  }
};
