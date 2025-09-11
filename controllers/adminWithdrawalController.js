const WithdrawalRequest = require('../models/withdrawalRequest');
const { getWalletBalances, releaseWithdrawalHold, createSellerPayout } = require('../utils/walletService');
const { createAdminNotification } = require('./adminNotificationController');

/**
 * Get all withdrawal requests for admin review with comprehensive details
 * GET /admin/withdrawals
 */
exports.getAllWithdrawalRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, selected_withdrawal_id } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log(`📋 Admin fetching withdrawal requests - Status filter: ${status || 'all'}, Selected: ${selected_withdrawal_id || 'none'}`);

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

    // Format withdrawal list for table
    const formattedRequests = withdrawalRequests.map(request => ({
      _id: request._id,
      seller: {
        _id: request.sellerId._id,
        name: request.sellerId.name,
        email: request.sellerId.email,
        profile_image: request.sellerId.profile_image || ''
      },
      amount: request.amount,
      status: request.status,
      requested_time: request.createdAt,
      // Display formatted date and time
      requested_date: new Date(request.createdAt).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit', 
        year: 'numeric'
      }),
      requested_time_formatted: new Date(request.createdAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    }));

    // Get selected withdrawal details for sidebar
    let selectedWithdrawalDetails = null;
    if (selected_withdrawal_id) {
      const selectedWithdrawal = await WithdrawalRequest.findById(selected_withdrawal_id)
        .populate('sellerId', 'name email profile_image')
        .populate('reviewed_by_admin_id', 'name email')
        .lean();

      if (selectedWithdrawal) {
        selectedWithdrawalDetails = {
          _id: selectedWithdrawal._id,
          seller: {
            _id: selectedWithdrawal.sellerId._id,
            name: selectedWithdrawal.sellerId.name,
            email: selectedWithdrawal.sellerId.email,
            profile_image: selectedWithdrawal.sellerId.profile_image || ''
          },
          amount: selectedWithdrawal.amount,
          status: selectedWithdrawal.status,
          requested_date: new Date(selectedWithdrawal.createdAt).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit', 
            year: 'numeric'
          }),
          requested_time: new Date(selectedWithdrawal.createdAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }),
          // Status-specific dates
          approval_date: selectedWithdrawal.approved_at ? new Date(selectedWithdrawal.approved_at).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit', 
            year: 'numeric'
          }) : null,
          approval_time: selectedWithdrawal.approved_at ? new Date(selectedWithdrawal.approved_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }) : null,
          rejection_date: selectedWithdrawal.rejected_at ? new Date(selectedWithdrawal.rejected_at).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit', 
            year: 'numeric'
          }) : null,
          rejection_time: selectedWithdrawal.rejected_at ? new Date(selectedWithdrawal.rejected_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }) : null,
          // Transaction details (for approved/paid status)
          transaction_id: selectedWithdrawal.external_reference?.transaction_id || '',
          screenshot_url: selectedWithdrawal.external_reference?.screenshot_url || '',
          payment_notes: selectedWithdrawal.external_reference?.notes || '',
          // Rejection details
          rejection_reason: selectedWithdrawal.rejection_reason || '',
          // Admin who reviewed
          reviewed_by: selectedWithdrawal.reviewed_by_admin_id ? {
            name: selectedWithdrawal.reviewed_by_admin_id.name,
            email: selectedWithdrawal.reviewed_by_admin_id.email
          } : null
        };
      }
    }

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    console.log(`✅ Retrieved ${withdrawalRequests.length} withdrawal requests for admin${selectedWithdrawalDetails ? ' with selected details' : ''}`);

    res.status(200).json({
      message: 'Withdrawal requests retrieved successfully',
      withdrawals: formattedRequests,
      selected_withdrawal: selectedWithdrawalDetails,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_count: totalCount,
        showing_text: `Showing ${Math.min(skip + 1, totalCount)} to ${Math.min(skip + parseInt(limit), totalCount)} of ${totalCount} products`
      }
    });

  } catch (error) {
    console.error('❌ Error getting withdrawal requests for admin:', error);
    res.status(500).json({ 
      message: 'Error retrieving withdrawal requests', 
      error: error.message 
    });
  }
};

/**
 * Approve a withdrawal request
 * POST /admin/withdrawals/:id/approve
 */
exports.approveWithdrawalRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { transaction_id, screenshot_url, notes } = req.body;
    const adminId = req.adminId; // Extract from admin JWT middleware

    // Validate required fields for approval
    if (!transaction_id || transaction_id.trim() === '') {
      return res.status(400).json({ 
        message: 'Transaction ID is required for approval' 
      });
    }

    if (!screenshot_url || screenshot_url.trim() === '') {
      return res.status(400).json({ 
        message: 'Screenshot URL is required for approval' 
      });
    }

    console.log(`✅ Admin ${adminId} approving withdrawal request: ${id} with transaction: ${transaction_id}`);

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
    
    // Store transaction details for approved requests
    if (!withdrawalRequest.external_reference) {
      withdrawalRequest.external_reference = {};
    }
    withdrawalRequest.external_reference.transaction_id = transaction_id.trim();
    withdrawalRequest.external_reference.screenshot_url = screenshot_url.trim(); // Now mandatory
    
    if (notes && notes.trim() !== '') {
      withdrawalRequest.external_reference.notes = notes.trim();
    }
    
    await withdrawalRequest.save();

    // Note: Funds are already held via WITHDRAW_REQUEST_HOLD transaction
    // Approval moves them from available to pending (already handled by wallet service)

    console.log(`✅ Withdrawal request approved: ${id} for seller: ${withdrawalRequest.sellerId.name}`);

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
          approvedDate: new Date()
        }
      }
    );

    res.status(200).json({
      message: 'Withdrawal request approved successfully',
      withdrawal_request: {
        _id: withdrawalRequest._id,
        status: withdrawalRequest.status,
        amount: withdrawalRequest.amount,
        transaction_id: withdrawalRequest.external_reference.transaction_id,
        screenshot_url: withdrawalRequest.external_reference.screenshot_url,
        notes: withdrawalRequest.external_reference.notes || '',
        approved_at: withdrawalRequest.approved_at
      }
    });

  } catch (error) {
    console.error('❌ Error approving withdrawal request:', error);
    res.status(500).json({ 
      message: 'Error approving withdrawal request', 
      error: error.message 
    });
  }
};

/**
 * Reject a withdrawal request
 * POST /admin/withdrawals/:id/reject
 */
exports.rejectWithdrawalRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason, transaction_id } = req.body;
    const adminId = req.adminId;

    if (!rejection_reason || rejection_reason.trim() === '') {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    if (!transaction_id || transaction_id.trim() === '') {
      return res.status(400).json({ message: 'Transaction ID is required for rejection' });
    }

    console.log(`❌ Admin ${adminId} rejecting withdrawal request: ${id}`);

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
    
    // Store transaction ID for rejected requests
    if (!withdrawalRequest.external_reference) {
      withdrawalRequest.external_reference = {};
    }
    withdrawalRequest.external_reference.transaction_id = transaction_id.trim();
    
    await withdrawalRequest.save();

    // Release the held funds back to available balance
    await releaseWithdrawalHold(
      withdrawalRequest.sellerId._id, 
      withdrawalRequest.amount, 
      withdrawalRequest._id
    );

    console.log(`✅ Withdrawal request rejected and funds released: ${id}`);

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
      withdrawal_request: {
        _id: withdrawalRequest._id,
        status: withdrawalRequest.status,
        rejection_reason: withdrawalRequest.rejection_reason,
        transaction_id: withdrawalRequest.external_reference.transaction_id,
        rejected_at: withdrawalRequest.rejected_at
      }
    });

  } catch (error) {
    console.error('❌ Error rejecting withdrawal request:', error);
    res.status(500).json({ 
      message: 'Error rejecting withdrawal request', 
      error: error.message 
    });
  }
};

/**
 * Mark withdrawal request as paid
 * POST /admin/withdrawals/:id/mark-paid
 */
exports.markWithdrawalAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { transaction_id, screenshot_url, notes } = req.body;
    const adminId = req.adminId;

    // Validate required fields
    if (!transaction_id || transaction_id.trim() === '') {
      return res.status(400).json({ 
        message: 'Transaction ID is required when marking as paid' 
      });
    }

    console.log(`💳 Admin ${adminId} marking withdrawal as paid: ${id} with transaction: ${transaction_id}`);

    // Find the withdrawal request
    const withdrawalRequest = await WithdrawalRequest.findById(id)
      .populate('sellerId', 'name email');

    if (!withdrawalRequest) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    if (withdrawalRequest.status !== 'Approved') {
      return res.status(400).json({ 
        message: 'Only approved withdrawal requests can be marked as paid',
        current_status: withdrawalRequest.status
      });
    }

    // Update withdrawal request status
    withdrawalRequest.status = 'Paid';
    withdrawalRequest.reviewed_by_admin_id = adminId;
    withdrawalRequest.reviewed_at = new Date();
    withdrawalRequest.paid_at = new Date();
    
    // Update external reference information (admin proof)
    withdrawalRequest.external_reference.transaction_id = transaction_id.trim();
    
    if (screenshot_url && screenshot_url.trim() !== '') {
      withdrawalRequest.external_reference.screenshot_url = screenshot_url.trim();
    }
    
    if (notes && notes.trim() !== '') {
      withdrawalRequest.external_reference.notes = notes.trim();
    }
    
    await withdrawalRequest.save();

    // Create seller payout transaction to finalize the withdrawal
    const payoutTransaction = await createSellerPayout(
      withdrawalRequest.sellerId._id,
      withdrawalRequest.amount,
      withdrawalRequest._id,
      {
        external_transaction_id: withdrawalRequest.external_reference.transaction_id,
        receipt_url: withdrawalRequest.external_reference.screenshot_url,
        processed_by_admin_id: adminId
      }
    );

    // Update withdrawal request with payout transaction reference
    withdrawalRequest.payout_transaction_id = payoutTransaction._id;
    await withdrawalRequest.save();

    console.log(`✅ Withdrawal marked as paid: ${id}, payout transaction: ${payoutTransaction._id}`);

    // Send admin notification
    await createAdminNotification(
      'withdrawal_paid',
      `Withdrawal of $${withdrawalRequest.amount} marked as paid for ${withdrawalRequest.sellerId.name}`,
      {
        withdrawalRequestId: withdrawalRequest._id,
        data: {
          sellerId: withdrawalRequest.sellerId._id,
          sellerName: withdrawalRequest.sellerId.name,
          sellerEmail: withdrawalRequest.sellerId.email,
          amount: withdrawalRequest.amount,
          transactionId: withdrawalRequest.external_reference.transaction_id || '',
          paidDate: new Date()
        }
      }
    );

    res.status(200).json({
      message: 'Withdrawal request marked as paid successfully',
      withdrawal_request: {
        _id: withdrawalRequest._id,
        status: withdrawalRequest.status,
        amount: withdrawalRequest.amount,
        transaction_id: withdrawalRequest.external_reference.transaction_id,
        screenshot_url: withdrawalRequest.external_reference.screenshot_url || '',
        notes: withdrawalRequest.external_reference.notes || '',
        paid_at: withdrawalRequest.paid_at,
        payout_transaction_id: withdrawalRequest.payout_transaction_id
      }
    });

  } catch (error) {
    console.error('❌ Error marking withdrawal as paid:', error);
    res.status(500).json({ 
      message: 'Error marking withdrawal as paid', 
      error: error.message 
    });
  }
};
