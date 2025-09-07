const WithdrawalRequest = require('../models/withdrawalRequest');
const { getWalletBalances, releaseWithdrawalHold, createSellerPayout } = require('../utils/walletService');
const { createAdminNotification } = require('./adminNotificationController');

/**
 * Get withdrawals for admin finance dashboard with all details included
 * GET /admin/finance/withdrawals
 */
exports.getWithdrawalsForFinanceDashboard = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log(`💰 Admin fetching withdrawals for finance dashboard - Status: ${status || 'all'}`);

    // Build query filter
    const filter = {};
    if (status) {
      const validStatuses = ['Pending', 'Approved', 'Paid', 'Rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          message: 'Invalid status filter',
          valid_statuses: validStatuses
        });
      }
      filter.status = status;
    }

    // Get withdrawal requests with seller information
    const [withdrawalRequests, totalCount] = await Promise.all([
      WithdrawalRequest.find(filter)
        .populate('sellerId', 'name email profile_image')
        .populate('reviewed_by_admin_id', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      
      WithdrawalRequest.countDocuments(filter)
    ]);

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
    const formattedWithdrawals = withdrawalRequests.map(request => ({
      _id: request._id,
      // Table data
      name: request.sellerId?.name || '',
      email: request.sellerId?.email || '',
      profile_image: request.sellerId?.profile_image || '',
      amount: request.amount || 0,
      status: request.status || '',
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
      
      createdAt: request.createdAt || new Date()
    }));

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    console.log(`✅ Retrieved ${withdrawalRequests.length} withdrawals for finance dashboard with all details`);

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
