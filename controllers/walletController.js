const { getWalletBalances, getUnifiedHistory, ensureWallet } = require('../utils/walletService');

/**
 * Get seller wallet information for mobile UI
 * GET /wallet
 */
exports.getWalletInfo = async (req, res) => {
  try {
    const sellerId = req.userId; // Extract from JWT middleware
    const { limit = 50 } = req.query; // Get more history for mobile, no pagination needed

    console.log(`📊 Getting wallet info for seller: ${sellerId}`);

    // Ensure wallet exists and get current balances
    await ensureWallet(sellerId);
    const balances = await getWalletBalances(sellerId);

    // Get unified history
    const historyData = await getUnifiedHistory(sellerId, {
      page: 1,
      limit: parseInt(limit)
    });

    // Format history for mobile UI - simple structure matching the screenshot
    const formattedHistory = historyData.history.map(item => {
      let type, amount;
      
      // Map transaction types to UI labels
      switch (item.ui_type) {
        case 'Deposit':
          type = 'Deposit';
          amount = Math.abs(item.amount); // Always positive for deposits
          break;
        case 'Payment':
          type = 'Payment';
          amount = -Math.abs(item.amount); // Always negative
          break;
        case 'Withdraw':
        case 'Withdraw Hold':
        case 'Withdraw Release':
          type = 'Withdraw';
          amount = -Math.abs(item.amount); // Always negative
          break;
        case 'Withdraw Request':
          type = 'Withdraw Request';
          amount = -Math.abs(item.amount); // Always negative
          break;
        case 'Penalty':
        case 'Refund':
        case 'Deposit Refund':
          type = 'Withdraw';
          amount = -Math.abs(item.amount); // Always negative
          break;
        default:
          type = item.ui_type;
          amount = item.amount;
      }

      return {
        type,
        amount,
        date: item.created_at,
        time: new Date(item.created_at).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        })
      };
    });

    console.log(`✅ Wallet info retrieved - Total Balance: $${balances.total_balance}`);

    // Return simplified structure matching mobile UI
    res.status(200).json({
      balance: balances.total_balance, // Single balance as shown in UI
      history: formattedHistory
    });

  } catch (error) {
    console.error('❌ Error getting wallet info:', error);
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

    console.log(`✅ Wallet refreshed - Total Balance: $${balances.total_balance}`);

    res.status(200).json({
      balance: balances.total_balance // Simplified response matching mobile UI
    });

  } catch (error) {
    console.error('❌ Error refreshing wallet:', error);
    res.status(500).json({ 
      message: 'Error refreshing wallet balances', 
      error: error.message 
    });
  }
};
