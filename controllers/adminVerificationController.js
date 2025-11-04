const User = require('../models/user');

/**
 * Get User Verification History
 * GET /admin/users/:userId/verification-history
 */
const getUserVerificationHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('name email phone_number age gender DOB location stripe_verification');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const verification = user.stripe_verification || {};

    res.status(200).json({
      message: 'Verification history retrieved successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number || "",
        age: user.age || "",
        gender: user.gender || "",
        DOB: user.DOB || "",
        address: user.location?.address || ""
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
 * Get Users Filtered by Verification Status (Simplified 3-Category System)
 * GET /admin/users/verification-filter?status=verified
 * 
 * Supported statuses:
 * - blocked: Users that are blocked (is_blocked: true)
 * - verified: Users that are verified (stripe_verification.status: 'verified')
 * - not_verified: All other users (including pending, failed, not_verified)
 * - all: All users
 */
const getUsersByVerificationStatus = async (req, res) => {
  try {
    const { status } = req.query;

    // Simplified to 3 main categories + all
    const validStatuses = ['blocked', 'verified', 'not_verified', 'all'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Invalid status parameter. Use: blocked, verified, not_verified, or all',
        valid_values: validStatuses
      });
    }

    // Build query based on simplified categories
    let query = {};
    if (status === 'blocked') {
      // Show only blocked users
      query['is_blocked'] = true;
    } else if (status === 'verified') {
      // Show only verified users (exclude blocked)
      query = {
        'stripe_verification.status': 'verified',
        'is_blocked': { $ne: true }
      };
    } else if (status === 'not_verified') {
      // Show all non-verified users (everything except 'verified') - exclude blocked
      query = {
        $and: [
          { 'is_blocked': { $ne: true } },  // Not blocked
          {
            $or: [
              { 'stripe_verification.status': { $ne: 'verified' } },  // Status exists but is not 'verified'
              { 'stripe_verification.status': { $exists: false } },   // No status field
              { 'stripe_verification': { $exists: false } }           // No verification object at all
            ]
          }
        ]
      };
    } else if (status === 'all') {
      // Show ALL users (no filter)
      query = {};
    }

    const users = await User.find(query)
      .select('name email phone_number profile_image age gender DOB location isUserVerified is_blocked stripe_verification createdAt')
      .sort({ createdAt: -1 });

    const formattedUsers = users.map(user => {
      // Determine simplified status for frontend
      let simplified_status = 'not_verified'; // Default
      if (user.is_blocked) {
        simplified_status = 'blocked';
      } else if (user.stripe_verification?.status === 'verified') {
        simplified_status = 'verified';
      }
      // All other cases (pending, failed, not_verified, no verification object) = 'not_verified'

      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        profile_image: user.profile_image,
        age: user.age || "",
        gender: user.gender || "",
        DOB: user.DOB || "",
        address: user.location?.address || "",
        isUserVerified: user.isUserVerified,
        is_blocked: user.is_blocked,
        simplified_status: simplified_status, // ← New field for frontend
        stripe_verification: {
          status: user.stripe_verification?.status || 'not_verified',
          verified_at: user.stripe_verification?.verified_at || '',
          last_attempt_at: user.stripe_verification?.last_attempt_at || '',
          attempts_count: user.stripe_verification?.attempts?.length || 0,
          fee_paid: user.stripe_verification?.verification_fee_paid || false
        },
        createdAt: user.createdAt
      };
    });

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


