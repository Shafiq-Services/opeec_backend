const User = require('../models/user');

/**
 * Get User Verification History
 * GET /admin/users/:userId/verification-history
 */
const getUserVerificationHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('name email stripe_verification');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const verification = user.stripe_verification || {};

    res.status(200).json({
      message: 'Verification history retrieved successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email
      },
      verification_history: verification.attempts || [],
      current_status: verification.status || 'not_verified',
      verified_at: verification.verified_at || '',
      total_attempts: verification.attempts?.length || 0,
      successful_attempts: verification.attempts?.filter(a => a.status === 'verified').length || 0,
      fee_paid: verification.verification_fee_paid || false,
      payment_intent_id: verification.payment_intent_id || ''
    });

  } catch (error) {
    console.error('❌ Error getting verification history:', error);
    res.status(500).json({
      message: 'Error fetching verification history',
      error: error.message
    });
  }
};

/**
 * Get Users Filtered by Verification Status
 * GET /admin/users/verification-filter?status=pending
 */
const getUsersByVerificationStatus = async (req, res) => {
  try {
    const { status } = req.query;

    const validStatuses = ['not_verified', 'pending', 'verified', 'failed', 'blocked', 'all'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Invalid status parameter',
        valid_values: validStatuses
      });
    }

    // Build query - exclude blocked users from verification status filters
    let query = {};
    if (status === 'blocked') {
      query['is_blocked'] = true;
    } else if (status === 'all') {
      // For 'all', show ALL users including blocked users
      query = {};  // No filter - show everyone
    } else {
      // For verification status filters, exclude blocked users AND filter by verification status
      query = {
        'stripe_verification.status': status,
        'is_blocked': { $ne: true }  // Exclude blocked users
      };
    }

    const users = await User.find(query)
      .select('name email phone_number profile_image isUserVerified is_blocked stripe_verification createdAt')
      .sort({ createdAt: -1 });

    const formattedUsers = users.map(user => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone_number: user.phone_number,
      profile_image: user.profile_image,
      isUserVerified: user.isUserVerified,
      is_blocked: user.is_blocked,
      stripe_verification: {
        status: user.stripe_verification?.status || 'not_verified',
        verified_at: user.stripe_verification?.verified_at || '',
        last_attempt_at: user.stripe_verification?.last_attempt_at || '',
        attempts_count: user.stripe_verification?.attempts?.length || 0,
        fee_paid: user.stripe_verification?.verification_fee_paid || false
      },
      createdAt: user.createdAt
    }));

    res.status(200).json({
      message: 'Users retrieved successfully',
      users: formattedUsers,
      total_count: formattedUsers.length,
      filter_applied: status
    });

  } catch (error) {
    console.error('❌ Error filtering users by verification:', error);
    res.status(500).json({
      message: 'Error fetching users',
      error: error.message
    });
  }
};

module.exports = {
  getUserVerificationHistory,
  getUsersByVerificationStatus
};


