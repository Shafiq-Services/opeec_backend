const WithdrawalRequest = require('../models/withdrawalRequest');
const { getWalletBalances, releaseWithdrawalHold, createSellerPayout } = require('../utils/walletService');
const { createAdminNotification } = require('./adminNotificationController');

/**
 * Get all withdrawal requests for admin review
 * GET /admin/withdrawals
 */
exports.getAllWithdrawalRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log(`📋 Admin fetching withdrawal requests - Status filter: ${status || 'all'}`);

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

    // Format response with seller information
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
      payment_method: request.payment_method,
      rejection_reason: request.rejection_reason || '',
      reviewed_by: request.reviewed_by_admin_id ? {
        name: request.reviewed_by_admin_id.name,
        email: request.reviewed_by_admin_id.email
      } : null,
      external_reference: request.external_reference || {},
      createdAt: request.createdAt,
      reviewed_at: request.reviewed_at,
      approved_at: request.approved_at,
      paid_at: request.paid_at,
      rejected_at: request.rejected_at
    }));

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    console.log(`✅ Retrieved ${withdrawalRequests.length} withdrawal requests for admin`);

    res.status(200).json({
      message: 'Withdrawal requests retrieved successfully',
      withdrawal_requests: formattedRequests,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_items: totalCount,
        items_per_page: parseInt(limit),
        has_next: parseInt(page) < totalPages,
        has_previous: parseInt(page) > 1
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
    const adminId = req.adminId; // Extract from admin JWT middleware

    console.log(`✅ Admin ${adminId} approving withdrawal request: ${id}`);

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
    const { rejection_reason } = req.body;
    const adminId = req.adminId;

    if (!rejection_reason || rejection_reason.trim() === '') {
      return res.status(400).json({ message: 'Rejection reason is required' });
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
    const { external_reference = {} } = req.body;
    const adminId = req.adminId;

    console.log(`💳 Admin ${adminId} marking withdrawal as paid: ${id}`);

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
    
    // Update external reference information
    if (external_reference.transaction_id) {
      withdrawalRequest.external_reference.transaction_id = external_reference.transaction_id;
    }
    if (external_reference.receipt_url) {
      withdrawalRequest.external_reference.receipt_url = external_reference.receipt_url;
    }
    if (external_reference.screenshot_url) {
      withdrawalRequest.external_reference.screenshot_url = external_reference.screenshot_url;
    }
    if (external_reference.notes) {
      withdrawalRequest.external_reference.notes = external_reference.notes;
    }
    
    await withdrawalRequest.save();

    // Create seller payout transaction to finalize the withdrawal
    const payoutTransaction = await createSellerPayout(
      withdrawalRequest.sellerId._id,
      withdrawalRequest.amount,
      withdrawalRequest._id,
      {
        external_transaction_id: external_reference.transaction_id,
        receipt_url: external_reference.receipt_url,
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
          transactionId: external_reference.transaction_id || '',
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
        external_reference: withdrawalRequest.external_reference,
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
