const WithdrawalRequest = require('../models/withdrawalRequest');
const { getWalletBalances, createWithdrawalHold } = require('../utils/walletService');

/**
 * Create a new withdrawal request
 * POST /withdrawals
 */
exports.createWithdrawalRequest = async (req, res) => {
  try {
    const sellerId = req.userId;
    const { amount } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Valid withdrawal amount is required' 
      });
    }

    console.log(`💰 Creating withdrawal request for seller: ${sellerId}, amount: $${amount}`);

    // Check available balance
    const balances = await getWalletBalances(sellerId);
    
    if (amount > balances.available_balance) {
      console.log(`❌ Insufficient balance - Requested: $${amount}, Available: $${balances.available_balance}`);
      return res.status(400).json({ 
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Create withdrawal request (payment method handled via chat)
    const withdrawalRequest = new WithdrawalRequest({
      sellerId,
      amount: Math.round(amount * 100) / 100, // Round to 2 decimal places
      payment_method: {
        type: 'other',
        details: {
          other_details: 'Payment method to be arranged via chat'
        }
      },
      status: 'Pending'
    });

    await withdrawalRequest.save();

    // Create hold transaction to reserve funds
    await createWithdrawalHold(sellerId, amount, withdrawalRequest._id);

    console.log(`✅ Withdrawal request created: ${withdrawalRequest._id}`);

    res.status(201).json({
      success: true,
      message: 'Withdrawal request created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating withdrawal request:', error);
    res.status(500).json({ 
      message: 'Error creating withdrawal request', 
      error: error.message 
    });
  }
};

/**
 * Get seller's own withdrawal requests - simplified for mobile UI
 * GET /withdrawals
 */
exports.getWithdrawalRequests = async (req, res) => {
  try {
    const sellerId = req.userId;
    const { limit = 50 } = req.query; // No pagination for mobile, just get recent requests

    console.log(`📋 Getting withdrawal requests for seller: ${sellerId}`);

    // Get withdrawal requests
    const withdrawalRequests = await WithdrawalRequest.find({ sellerId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    // Format response for mobile UI - simple structure (user sees transaction_id but not screenshot)
    const formattedRequests = withdrawalRequests.map(request => ({
      id: request._id,
      amount: request.amount,
      status: request.status,
      date: request.createdAt,
      time: new Date(request.createdAt).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }),
      rejection_reason: request.rejection_reason || '',
      transaction_id: request.external_reference?.transaction_id || '' // User can see transaction ID for their records
    }));

    console.log(`✅ Found ${withdrawalRequests.length} withdrawal requests`);

    res.status(200).json({
      requests: formattedRequests
    });

  } catch (error) {
    console.error('❌ Error getting withdrawal requests:', error);
    res.status(500).json({ 
      message: 'Error retrieving withdrawal requests', 
      error: error.message 
    });
  }
};
