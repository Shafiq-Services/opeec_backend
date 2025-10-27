const WithdrawalRequest = require('../models/withdrawalRequest');
const Order = require('../models/orders');
const User = require('../models/user');
const Equipment = require('../models/equipment');
const { getWalletBalances, releaseWithdrawalHold, createSellerPayout } = require('../utils/walletService');
const { createAdminNotification } = require('./adminNotificationController');

/**
 * Helper function to map Stripe transfer status to admin-friendly status
 */
function mapStripeStatusToAdmin(stripeStatus) {
  const statusMap = {
    'pending': 'Pending',
    'processing': 'Approved', 
    'completed': 'Paid',
    'failed': 'Rejected',
    'cancelled': 'Rejected'
  };
  return statusMap[stripeStatus] || 'Pending';
}

/**
 * Get withdrawals for admin finance dashboard with all details included
 * GET /admin/finance/withdrawals
 */
exports.getWithdrawalsForFinanceDashboard = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type = 'all' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log(`💰 Admin fetching withdrawals for finance dashboard - Status: ${status || 'all'}, Type: ${type}`);

    // Validate type filter
    const validTypes = ['all', 'manual', 'stripe'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        message: 'Invalid type filter',
        valid_types: validTypes
      });
    }

    // Build status filter for manual withdrawals
    const manualFilter = {};
    if (status) {
      const validStatuses = ['Pending', 'Approved', 'Paid', 'Rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          message: 'Invalid status filter',
          valid_statuses: validStatuses
        });
      }
      manualFilter.status = status;
    }

    // Build status filter for Stripe transfers
    const stripeFilter = { 'stripe_payout.transfer_id': { $ne: "" } };
    if (status) {
      // Map admin status to Stripe transfer status
      const statusMap = {
        'Pending': 'pending',
        'Approved': 'processing', 
        'Paid': 'completed',
        'Rejected': 'failed'
      };
      if (statusMap[status]) {
        stripeFilter['stripe_payout.transfer_status'] = statusMap[status];
      }
    }

    // Get data based on type filter
    let allWithdrawals = [];
    let totalCount = 0;

    // Get manual withdrawals
    if (type === 'all' || type === 'manual') {
      const manualWithdrawals = await WithdrawalRequest.find(manualFilter)
        .populate('sellerId', 'name email profile_image')
        .populate('reviewed_by_admin_id', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      // Format manual withdrawals
      manualWithdrawals.forEach(request => {
        allWithdrawals.push({
          ...request,
          type: 'manual',
          withdrawal_type: 'Manual Request',
          sort_date: request.createdAt
        });
      });
    }

    // Get Stripe transfers
    if (type === 'all' || type === 'stripe') {
      const stripeTransfers = await Order.find(stripeFilter)
        .populate('equipmentId', 'ownerId title')
        .sort({ 'stripe_payout.transfer_triggered_at': -1 })
        .lean();

      // Get owner details for each transfer
      for (const order of stripeTransfers) {
        const owner = await User.findById(order.equipmentId.ownerId)
          .select('name email profile_image')
          .lean();

        if (owner) {
          // Format Stripe transfer as withdrawal
          allWithdrawals.push({
            _id: order._id,
            sellerId: owner,
            amount: order.stripe_payout.transfer_amount,
            status: mapStripeStatusToAdmin(order.stripe_payout.transfer_status),
            createdAt: order.stripe_payout.transfer_triggered_at || order.createdAt,
            type: 'stripe',
            withdrawal_type: 'Stripe Payout',
            stripe_transfer_id: order.stripe_payout.transfer_id,
            order_id: order._id,
            equipment_title: order.equipmentId.title,
            sort_date: order.stripe_payout.transfer_triggered_at || order.createdAt
          });
        }
      }
    }

    // Sort all withdrawals by date
    allWithdrawals.sort((a, b) => new Date(b.sort_date) - new Date(a.sort_date));

    // Apply pagination
    totalCount = allWithdrawals.length;
    const paginatedWithdrawals = allWithdrawals.slice(skip, skip + parseInt(limit));

    // Helper functions for date formatting (no null values)
    const formatDate = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit', 
        year: 'numeric'
      });
    };

    const formatTime = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    };

    // Format withdrawal list with all details for both table and sidebar (no null values)
    const formattedWithdrawals = paginatedWithdrawals.map(request => {
      const baseData = {
        _id: request._id,
        // Table data
        name: request.sellerId?.name || '',
        email: request.sellerId?.email || '',
        profile_image: request.sellerId?.profile_image || '',
        amount: request.amount || 0,
        status: request.status || '',
        type: request.type || 'manual',
        withdrawal_type: request.withdrawal_type || 'Manual Request',
        requested_time: formatDate(request.createdAt) + ' ' + formatTime(request.createdAt),
        
        // Sidebar data - all possible fields (no null values)
        seller: {
          _id: request.sellerId?._id || '',
          name: request.sellerId?.name || '',
          email: request.sellerId?.email || '',
          profile_image: request.sellerId?.profile_image || ''
        },
        requested_date: formatDate(request.createdAt),
        requested_time_formatted: formatTime(request.createdAt),
        
        createdAt: request.createdAt || new Date()
      };

      // Add type-specific fields
      if (request.type === 'manual') {
        // Manual withdrawal specific fields
        return {
          ...baseData,
          // Status-specific fields (empty strings instead of null)
          approval_date: formatDate(request.approved_at),
          approval_time: formatTime(request.approved_at),
          rejection_date: formatDate(request.rejected_at),
          rejection_time: formatTime(request.rejected_at),
          
          // Transaction details (for approved/paid status)
          transaction_id: request.external_reference?.transaction_id || '',
          screenshot_url: request.external_reference?.screenshot_url || '',
          payment_notes: request.external_reference?.notes || '',
          
          // Rejection details
          rejection_reason: request.rejection_reason || '',
          
          // Admin who reviewed (empty object instead of null)
          reviewed_by: request.reviewed_by_admin_id ? {
            name: request.reviewed_by_admin_id.name || '',
            email: request.reviewed_by_admin_id.email || ''
          } : {
            name: '',
            email: ''
          },
          
          // Action buttons for manual withdrawals
          actions: request.status === 'Pending' ? ['approve', 'reject'] : ['view_details']
        };
      } else {
        // Stripe transfer specific fields
        return {
          ...baseData,
          // Stripe-specific fields
          stripe_transfer_id: request.stripe_transfer_id || '',
          order_id: request.order_id || '',
          equipment_title: request.equipment_title || '',
          
          // Action buttons for Stripe transfers
          actions: ['view_details'],
          
          // Empty fields for consistency
          approval_date: '',
          approval_time: '',
          rejection_date: '',
          rejection_time: '',
          transaction_id: request.stripe_transfer_id || '',
          screenshot_url: '',
          payment_notes: '',
          rejection_reason: '',
          reviewed_by: { name: 'Automated', email: 'system@opeec.com' }
        };
      }
    });

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    console.log(`✅ Retrieved ${formattedWithdrawals.length} withdrawals for finance dashboard (${type} type, ${status || 'all'} status)`);

    res.status(200).json({
      message: 'Withdrawals retrieved successfully for finance dashboard',
      withdrawals: formattedWithdrawals || [],
      pagination: {
        current_page: parseInt(page) || 1,
        total_pages: totalPages || 0,
        total_count: totalCount || 0,
        showing_text: totalCount > 0 
          ? `Showing ${Math.min(skip + 1, totalCount)} to ${Math.min(skip + parseInt(limit), totalCount)} of ${totalCount} products`
          : 'No products found'
      }
    });

  } catch (error) {
    console.error('❌ Error getting withdrawals for finance dashboard:', error);
    res.status(500).json({ 
      message: 'Error retrieving withdrawals for finance dashboard', 
      error: error?.message || 'Unknown error occurred',
      withdrawals: [],
      pagination: {
        current_page: 1,
        total_pages: 0,
        total_count: 0,
        showing_text: 'No products found'
      }
    });
  }
};

/**
 * Get Stripe transfer details for admin view
 * GET /admin/finance/stripe-transfer-details/:orderId
 */
exports.getStripeTransferDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    console.log(`🔍 Admin requesting Stripe transfer details for order: ${orderId}`);

    // Get order with transfer details
    const order = await Order.findById(orderId)
      .populate('equipmentId', 'title images ownerId')
      .populate('userId', 'name email')
      .lean();

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    if (!order.stripe_payout?.transfer_id) {
      return res.status(404).json({
        message: 'No Stripe transfer found for this order'
      });
    }

    // Get owner details
    const owner = await User.findById(order.equipmentId.ownerId)
      .select('name email phone_number stripe_connect')
      .lean();

    if (!owner) {
      return res.status(404).json({
        message: 'Equipment owner not found'
      });
    }

    const transferDetails = {
      order_id: order._id,
      equipment: {
        title: order.equipmentId.title,
        images: order.equipmentId.images || []
      },
      owner: {
        name: owner.name,
        email: owner.email,
        phone: owner.phone_number,
        stripe_account_id: owner.stripe_connect?.account_id || 'Not connected'
      },
      renter: {
        name: order.userId.name,
        email: order.userId.email
      },
      financial_breakdown: {
        rental_fee: order.rental_fee,
        platform_fee: order.platform_fee,
        tax_amount: order.tax_amount,
        penalty_amount: order.penalty_amount || 0,
        transfer_amount: order.stripe_payout.transfer_amount
      },
      transfer_details: {
        transfer_id: order.stripe_payout.transfer_id,
        status: mapStripeStatusToAdmin(order.stripe_payout.transfer_status),
        raw_status: order.stripe_payout.transfer_status,
        triggered_at: order.stripe_payout.transfer_triggered_at,
        completed_at: order.stripe_payout.transfer_completed_at,
        failure_reason: order.stripe_payout.transfer_failure_reason || null
      },
      rental_details: {
        start_date: order.rental_schedule.start_date,
        end_date: order.rental_schedule.end_date,
        rental_status: order.rental_status,
        location: order.location
      }
    };

    console.log(`✅ Retrieved Stripe transfer details for order ${orderId}`);

    res.status(200).json({
      message: 'Stripe transfer details retrieved successfully',
      transfer_details: transferDetails
    });

  } catch (error) {
    console.error('❌ Error getting Stripe transfer details:', error);
    res.status(500).json({
      message: 'Error retrieving transfer details',
      error: error.message
    });
  }
};

/**
 * Approve a withdrawal request from finance dashboard
 * POST /admin/finance/withdrawals/approve?id=withdrawal_id
 */
exports.approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.query;
    const { transaction_id, screenshot_url } = req.body;
    const adminId = req.adminId;

    // Validate required fields
    if (!id || id.trim() === '') {
      return res.status(400).json({ 
        message: 'Withdrawal ID is required' 
      });
    }

    if (!transaction_id || transaction_id.trim() === '') {
      return res.status(400).json({ 
        message: 'Transaction ID is required for approval' 
      });
    }

    console.log(`✅ Admin ${adminId} approving withdrawal from finance dashboard: ${id} with transaction: ${transaction_id}`);

    // Find the withdrawal request
    const withdrawalRequest = await WithdrawalRequest.findById(id)
      .populate('sellerId', 'name email');

    if (!withdrawalRequest) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    if (withdrawalRequest.status !== 'Pending') {
      return res.status(400).json({ 
        message: 'Only pending withdrawal requests can be approved',
        current_status: withdrawalRequest.status
      });
    }

    // Update withdrawal request status
    withdrawalRequest.status = 'Approved';
    withdrawalRequest.reviewed_by_admin_id = adminId;
    withdrawalRequest.reviewed_at = new Date();
    withdrawalRequest.approved_at = new Date();
    
    // Store transaction ID and screenshot
    if (!withdrawalRequest.external_reference) {
      withdrawalRequest.external_reference = {};
    }
    withdrawalRequest.external_reference.transaction_id = transaction_id.trim();
    
    // Add screenshot URL if provided
    if (screenshot_url && screenshot_url.trim() !== '') {
      withdrawalRequest.external_reference.screenshot_url = screenshot_url.trim();
    }
    
    await withdrawalRequest.save();

    console.log(`✅ Withdrawal request approved from finance dashboard: ${id}`);

    // Send admin notification
    await createAdminNotification(
      'withdrawal_approved',
      `Withdrawal request of $${withdrawalRequest.amount} approved for ${withdrawalRequest.sellerId.name}`,
      {
        withdrawalRequestId: withdrawalRequest._id,
        data: {
          sellerId: withdrawalRequest.sellerId._id,
          sellerName: withdrawalRequest.sellerId.name,
          sellerEmail: withdrawalRequest.sellerId.email,
          amount: withdrawalRequest.amount,
          transactionId: transaction_id,
          approvedDate: new Date()
        }
      }
    );

    res.status(200).json({
      message: 'Withdrawal request approved successfully',
      withdrawal: {
        _id: withdrawalRequest._id || '',
        status: withdrawalRequest.status || '',
        amount: withdrawalRequest.amount || 0,
        transaction_id: transaction_id || '',
        screenshot_url: withdrawalRequest.external_reference?.screenshot_url || '',
        approved_at: withdrawalRequest.approved_at || new Date()
      }
    });

  } catch (error) {
    console.error('❌ Error approving withdrawal from finance dashboard:', error);
    res.status(500).json({ 
      message: 'Error approving withdrawal request', 
      error: error?.message || 'Unknown error occurred'
    });
  }
};

/**
 * Reject a withdrawal request from finance dashboard
 * POST /admin/finance/withdrawals/reject?id=withdrawal_id
 */
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.query;
    const { rejection_reason } = req.body;
    const adminId = req.adminId;

    // Validate required fields
    if (!id || id.trim() === '') {
      return res.status(400).json({ 
        message: 'Withdrawal ID is required' 
      });
    }

    if (!rejection_reason || rejection_reason.trim() === '') {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    console.log(`❌ Admin ${adminId} rejecting withdrawal from finance dashboard: ${id}`);

    // Find the withdrawal request
    const withdrawalRequest = await WithdrawalRequest.findById(id)
      .populate('sellerId', 'name email');

    if (!withdrawalRequest) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    if (!['Pending', 'Approved'].includes(withdrawalRequest.status)) {
      return res.status(400).json({ 
        message: 'Only pending or approved withdrawal requests can be rejected',
        current_status: withdrawalRequest.status
      });
    }

    // Update withdrawal request status
    withdrawalRequest.status = 'Rejected';
    withdrawalRequest.rejection_reason = rejection_reason.trim();
    withdrawalRequest.reviewed_by_admin_id = adminId;
    withdrawalRequest.reviewed_at = new Date();
    withdrawalRequest.rejected_at = new Date();
    
    await withdrawalRequest.save();

    // Release the held funds back to available balance
    await releaseWithdrawalHold(
      withdrawalRequest.sellerId._id, 
      withdrawalRequest.amount, 
      withdrawalRequest._id
    );

    console.log(`✅ Withdrawal request rejected from finance dashboard and funds released: ${id}`);

    // Send admin notification
    await createAdminNotification(
      'withdrawal_rejected',
      `Withdrawal request of $${withdrawalRequest.amount} rejected for ${withdrawalRequest.sellerId.name}`,
      {
        withdrawalRequestId: withdrawalRequest._id,
        data: {
          sellerId: withdrawalRequest.sellerId._id,
          sellerName: withdrawalRequest.sellerId.name,
          sellerEmail: withdrawalRequest.sellerId.email,
          amount: withdrawalRequest.amount,
          rejectionReason: rejection_reason,
          rejectedDate: new Date()
        }
      }
    );

    res.status(200).json({
      message: 'Withdrawal request rejected successfully',
      withdrawal: {
        _id: withdrawalRequest._id || '',
        status: withdrawalRequest.status || '',
        rejection_reason: withdrawalRequest.rejection_reason || '',
        rejected_at: withdrawalRequest.rejected_at || new Date()
      }
    });

  } catch (error) {
    console.error('❌ Error rejecting withdrawal from finance dashboard:', error);
    res.status(500).json({ 
      message: 'Error rejecting withdrawal request', 
      error: error?.message || 'Unknown error occurred'
    });
  }
};
