/**
 * Stripe Connect Testing Controller
 * 
 * This controller provides endpoints to simulate Stripe Connect webhook events
 * for testing purposes, so you don't need to complete real Stripe onboarding.
 */

const User = require('../models/user');
const { createAdminNotification } = require('./adminNotificationController');

/**
 * Simulate account.updated webhook - change user from pending to active
 * POST /stripe-connect/test/simulate-account-active
 */
exports.simulateAccountActive = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required to find user'
      });
    }
    
    // Find user with pending Stripe Connect account
    const user = await User.findOne({ 
      email: email,
      'stripe_connect.account_id': { $exists: true, $ne: '' }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found or no Stripe Connect account'
      });
    }
    
    if (user.stripe_connect.account_status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'User account is already active'
      });
    }
    
    // Simulate successful onboarding completion
    user.stripe_connect.charges_enabled = false; // Equipment owners don't accept payments
    user.stripe_connect.payouts_enabled = true;
    user.stripe_connect.details_submitted = true;
    user.stripe_connect.onboarding_completed = true;
    user.stripe_connect.account_status = 'active';
    user.stripe_connect.last_updated = new Date();
    
    await user.save();
    
    console.log(`✅ Simulated account activation for user: ${user.email}`);
    
    // Send admin notification
    await createAdminNotification({
      type: 'STRIPE_CONNECT_ONBOARDING_COMPLETED',
      message: `${user.name} (${user.email}) completed Stripe Connect onboarding (TEST SIMULATION)`,
      metadata: {
        user_id: user._id.toString(),
        stripe_account_id: user.stripe_connect.account_id,
        simulated: true
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Account status updated to active',
      user: {
        email: user.email,
        name: user.name,
        stripe_connect: {
          account_id: user.stripe_connect.account_id,
          account_status: user.stripe_connect.account_status,
          onboarding_completed: user.stripe_connect.onboarding_completed,
          payouts_enabled: user.stripe_connect.payouts_enabled
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error simulating account activation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to simulate account activation',
      error: error.message
    });
  }
};

/**
 * Simulate account.updated webhook - change user from active to disabled
 * POST /stripe-connect/test/simulate-account-disabled
 */
exports.simulateAccountDisabled = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required to find user'
      });
    }
    
    const user = await User.findOne({ 
      email: email,
      'stripe_connect.account_id': { $exists: true, $ne: '' }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found or no Stripe Connect account'
      });
    }
    
    // Simulate account disabled (e.g., due to verification issues)
    user.stripe_connect.payouts_enabled = false;
    user.stripe_connect.account_status = 'disabled';
    user.stripe_connect.last_updated = new Date();
    
    await user.save();
    
    console.log(`⚠️ Simulated account disabled for user: ${user.email}`);
    
    // Send admin notification
    await createAdminNotification({
      type: 'STRIPE_CONNECT_ACCOUNT_DISABLED',
      message: `${user.name} (${user.email}) Stripe Connect account was disabled (TEST SIMULATION)`,
      metadata: {
        user_id: user._id.toString(),
        stripe_account_id: user.stripe_connect.account_id,
        simulated: true
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Account status updated to disabled',
      user: {
        email: user.email,
        name: user.name,
        stripe_connect: {
          account_id: user.stripe_connect.account_id,
          account_status: user.stripe_connect.account_status,
          onboarding_completed: user.stripe_connect.onboarding_completed,
          payouts_enabled: user.stripe_connect.payouts_enabled
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error simulating account disabled:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to simulate account disabled',
      error: error.message
    });
  }
};

/**
 * Get all users with Stripe Connect accounts (for testing)
 * GET /stripe-connect/test/users
 */
exports.getStripeConnectUsers = async (req, res) => {
  try {
    const users = await User.find({
      'stripe_connect.account_id': { $exists: true, $ne: '' }
    }).select('name email stripe_connect').lean();
    
    res.status(200).json({
      success: true,
      message: `Found ${users.length} users with Stripe Connect accounts`,
      users: users.map(user => ({
        email: user.email,
        name: user.name,
        account_id: user.stripe_connect.account_id,
        status: user.stripe_connect.account_status,
        onboarding_completed: user.stripe_connect.onboarding_completed,
        payouts_enabled: user.stripe_connect.payouts_enabled,
        last_updated: user.stripe_connect.last_updated
      }))
    });
    
  } catch (error) {
    console.error('❌ Error getting Stripe Connect users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: error.message
    });
  }
};

/**
 * Reset user's Stripe Connect status to pending (for re-testing)
 * POST /stripe-connect/test/reset-to-pending
 */
exports.resetToPending = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required to find user'
      });
    }
    
    const user = await User.findOne({ 
      email: email,
      'stripe_connect.account_id': { $exists: true, $ne: '' }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found or no Stripe Connect account'
      });
    }
    
    // Reset to pending status
    user.stripe_connect.charges_enabled = false;
    user.stripe_connect.payouts_enabled = false;
    user.stripe_connect.details_submitted = false;
    user.stripe_connect.onboarding_completed = false;
    user.stripe_connect.account_status = 'pending';
    user.stripe_connect.last_updated = new Date();
    
    await user.save();
    
    console.log(`🔄 Reset Stripe Connect status to pending for user: ${user.email}`);
    
    res.status(200).json({
      success: true,
      message: 'Account status reset to pending',
      user: {
        email: user.email,
        name: user.name,
        stripe_connect: {
          account_id: user.stripe_connect.account_id,
          account_status: user.stripe_connect.account_status,
          onboarding_completed: user.stripe_connect.onboarding_completed,
          payouts_enabled: user.stripe_connect.payouts_enabled
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error resetting to pending:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset status',
      error: error.message
    });
  }
};
