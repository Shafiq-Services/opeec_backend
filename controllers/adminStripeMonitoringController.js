const Order = require('../models/orders');
const User = require('../models/user');
const TransactionLog = require('../models/transactionLog');
const Equipment = require('../models/equipment');

/**
 * Admin Stripe Monitoring Controller
 * Provides admin dashboard visibility into Stripe Connect transfers and payouts
 * Read-only monitoring - no approval needed (automatic payouts)
 */

/**
 * Get all Stripe Connect accounts (equipment owners)
 * GET /admin/stripe-connect/accounts
 */
exports.getAllConnectAccounts = async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    // Build query
    const query = { 'stripe_connect.account_id': { $ne: "" } };
    if (status) {
      query['stripe_connect.account_status'] = status;
    }

    const users = await User.find(query)
      .select('name email stripe_connect createdAt')
      .sort({ 'stripe_connect.last_updated': -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const total = await User.countDocuments(query);

    const accounts = users.map(user => ({
      user_id: user._id,
      name: user.name,
      email: user.email,
      stripe_account_id: user.stripe_connect.account_id,
      account_status: user.stripe_connect.account_status,
      onboarding_completed: user.stripe_connect.onboarding_completed,
      payouts_enabled: user.stripe_connect.payouts_enabled,
      last_updated: user.stripe_connect.last_updated,
      registered_at: user.createdAt
    }));

    res.status(200).json({
      success: true,
      accounts,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('❌ Error fetching Connect accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Connect accounts',
      error: error.message
    });
  }
};

/**
 * Get all Stripe transfers (automated payouts)
 * GET /admin/stripe-connect/transfers
 */
exports.getAllTransfers = async (req, res) => {
  try {
    const { status, limit = 50, offset = 0, user_id } = req.query;

    // Build query
    const query = { 'stripe_payout.transfer_id': { $ne: "" } };
    
    if (status) {
      query['stripe_payout.transfer_status'] = status;
    }

    // If filtering by specific user (equipment owner)
    if (user_id) {
      const equipment = await Equipment.find({ ownerId: user_id }).select('_id');
      const equipmentIds = equipment.map(e => e._id);
      query.equipmentId = { $in: equipmentIds };
    }

    const orders = await Order.find(query)
      .populate('equipmentId', 'title images ownerId')
      .populate('userId', 'name email')
      .select('equipmentId userId rental_fee platform_fee penalty_amount stripe_payout createdAt rental_schedule')
      .sort({ 'stripe_payout.transfer_triggered_at': -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const total = await Order.countDocuments(query);

    // Enrich with owner information
    const transfers = await Promise.all(orders.map(async (order) => {
      const owner = await User.findById(order.equipmentId.ownerId)
        .select('name email stripe_connect')
        .lean();

      return {
        order_id: order._id,
        equipment_title: order.equipmentId.title,
        equipment_image: order.equipmentId.images?.[0] || '',
        owner: {
          id: owner._id,
          name: owner.name,
          email: owner.email,
          stripe_account_id: owner.stripe_connect?.account_id || ''
        },
        renter: {
          id: order.userId._id,
          name: order.userId.name,
          email: order.userId.email
        },
        rental_period: {
          start_date: order.rental_schedule.start_date,
          end_date: order.rental_schedule.end_date
        },
        financial_breakdown: {
          rental_fee: order.rental_fee,
          platform_fee: order.platform_fee,
          penalty_amount: order.penalty_amount || 0,
          transfer_amount: order.stripe_payout.transfer_amount
        },
        transfer: {
          transfer_id: order.stripe_payout.transfer_id,
          status: order.stripe_payout.transfer_status,
          triggered_at: order.stripe_payout.transfer_triggered_at,
          completed_at: order.stripe_payout.transfer_completed_at,
          failure_reason: order.stripe_payout.transfer_failure_reason || null
        },
        order_created_at: order.createdAt
      };
    }));

    res.status(200).json({
      success: true,
      transfers,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('❌ Error fetching transfers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transfers',
      error: error.message
    });
  }
};

/**
 * Get transfer statistics summary
 * GET /admin/stripe-connect/statistics
 */
exports.getTransferStatistics = async (req, res) => {
  try {
    // Total transfers by status
    const statusCounts = await Order.aggregate([
      { $match: { 'stripe_payout.transfer_id': { $ne: "" } } },
      { $group: {
        _id: '$stripe_payout.transfer_status',
        count: { $sum: 1 },
        total_amount: { $sum: '$stripe_payout.transfer_amount' }
      }}
    ]);

    // Total amount transferred
    const totalTransferred = await Order.aggregate([
      { 
        $match: { 
          'stripe_payout.transfer_id': { $ne: "" },
          'stripe_payout.transfer_status': 'completed'
        }
      },
      { $group: {
        _id: null,
        total: { $sum: '$stripe_payout.transfer_amount' },
        count: { $sum: 1 }
      }}
    ]);

    // Failed transfers needing attention
    const failedCount = await Order.countDocuments({
      'stripe_payout.transfer_status': 'failed'
    });

    // Pending/processing transfers
    const pendingCount = await Order.countDocuments({
      'stripe_payout.transfer_status': { $in: ['pending', 'processing'] }
    });

    // Active Connect accounts
    const activeAccounts = await User.countDocuments({
      'stripe_connect.account_status': 'active',
      'stripe_connect.payouts_enabled': true
    });

    // Pending onboarding
    const pendingOnboarding = await User.countDocuments({
      'stripe_connect.account_id': { $ne: "" },
      'stripe_connect.onboarding_completed': false
    });

    // Recent transfers (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentTransfers = await Order.countDocuments({
      'stripe_payout.transfer_triggered_at': { $gte: yesterday }
    });

    res.status(200).json({
      success: true,
      statistics: {
        transfers: {
          by_status: statusCounts,
          failed_needing_attention: failedCount,
          pending_or_processing: pendingCount,
          recent_24h: recentTransfers
        },
        total_transferred: {
          amount: totalTransferred[0]?.total || 0,
          count: totalTransferred[0]?.count || 0
        },
        connect_accounts: {
          active: activeAccounts,
          pending_onboarding: pendingOnboarding
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};

/**
 * Get specific transfer details
 * GET /admin/stripe-connect/transfer/:orderId
 */
exports.getTransferDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate('equipmentId', 'title images ownerId')
      .populate('userId', 'name email phone_number')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!order.stripe_payout?.transfer_id) {
      return res.status(404).json({
        success: false,
        message: 'No Stripe transfer found for this order'
      });
    }

    // Get owner details
    const owner = await User.findById(order.equipmentId.ownerId)
      .select('name email phone_number stripe_connect')
      .lean();

    // Get transaction log entry for this payout
    const transactionLog = await TransactionLog.findOne({
      orderId: orderId,
      type: 'STRIPE_PAYOUT'
    }).lean();

    const details = {
      order_id: order._id,
      equipment: {
        id: order.equipmentId._id,
        title: order.equipmentId.title,
        images: order.equipmentId.images
      },
      owner: {
        id: owner._id,
        name: owner.name,
        email: owner.email,
        phone: owner.phone_number,
        stripe_account_id: owner.stripe_connect?.account_id || '',
        account_status: owner.stripe_connect?.account_status || 'not_connected'
      },
      renter: {
        id: order.userId._id,
        name: order.userId.name,
        email: order.userId.email,
        phone: order.userId.phone_number
      },
      rental_details: {
        start_date: order.rental_schedule.start_date,
        end_date: order.rental_schedule.end_date,
        rental_status: order.rental_status,
        returned_at: order.return_status?.returned_at || null
      },
      financial_breakdown: {
        rental_fee: order.rental_fee,
        platform_fee: order.platform_fee,
        tax_amount: order.tax_amount,
        insurance_amount: order.insurance_amount,
        deposit_amount: order.deposit_amount,
        penalty_amount: order.penalty_amount || 0,
        total_paid_by_renter: order.total_amount,
        transfer_amount_to_owner: order.stripe_payout.transfer_amount
      },
      stripe_transfer: {
        transfer_id: order.stripe_payout.transfer_id,
        status: order.stripe_payout.transfer_status,
        payment_intent_id: order.stripe_payout.payment_intent_id,
        destination_account_id: order.stripe_payout.destination_account_id,
        triggered_at: order.stripe_payout.transfer_triggered_at,
        completed_at: order.stripe_payout.transfer_completed_at,
        failure_reason: order.stripe_payout.transfer_failure_reason || null
      },
      transaction_log: transactionLog ? {
        transaction_id: transactionLog._id,
        type: transactionLog.type,
        amount: transactionLog.amount,
        description: transactionLog.description,
        status: transactionLog.status,
        created_at: transactionLog.createdAt
      } : null
    };

    res.status(200).json({
      success: true,
      transfer_details: details
    });

  } catch (error) {
    console.error('❌ Error fetching transfer details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transfer details',
      error: error.message
    });
  }
};

/**
 * Get user's (owner's) complete payout history
 * GET /admin/stripe-connect/user-payouts/:userId
 */
exports.getUserPayoutHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;

    const user = await User.findById(userId).select('name email stripe_connect').lean();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find all equipment owned by this user
    const equipment = await Equipment.find({ ownerId: userId }).select('_id title');
    const equipmentIds = equipment.map(e => e._id);

    // Find all orders with payouts
    const orders = await Order.find({
      equipmentId: { $in: equipmentIds },
      'stripe_payout.transfer_id': { $ne: "" }
    })
    .select('equipmentId rental_fee stripe_payout createdAt')
    .sort({ 'stripe_payout.transfer_triggered_at': -1 })
    .limit(parseInt(limit))
    .lean();

    const payoutHistory = orders.map(order => {
      const equipmentItem = equipment.find(e => e._id.toString() === order.equipmentId.toString());
      return {
        order_id: order._id,
        equipment_title: equipmentItem?.title || 'Unknown',
        transfer_amount: order.stripe_payout.transfer_amount,
        transfer_status: order.stripe_payout.transfer_status,
        transfer_id: order.stripe_payout.transfer_id,
        triggered_at: order.stripe_payout.transfer_triggered_at,
        completed_at: order.stripe_payout.transfer_completed_at
      };
    });

    // Calculate total earned
    const totalEarned = orders
      .filter(o => o.stripe_payout.transfer_status === 'completed')
      .reduce((sum, o) => sum + o.stripe_payout.transfer_amount, 0);

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        stripe_account_id: user.stripe_connect?.account_id || '',
        account_status: user.stripe_connect?.account_status || 'not_connected'
      },
      total_earned: totalEarned,
      payout_history: payoutHistory,
      total_payouts: payoutHistory.length
    });

  } catch (error) {
    console.error('❌ Error fetching user payout history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user payout history',
      error: error.message
    });
  }
};

// All functions are exported individually using exports.functionName above

