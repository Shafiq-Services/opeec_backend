const { getStripeInstance } = require('../utils/stripeIdentity');
const User = require('../models/user');
const Order = require('../models/orders');
const Equipment = require('../models/equipment');
const { createTransaction } = require('../utils/walletService');
const { createAdminNotification } = require('./adminNotificationController');

/**
 * Stripe Connect Controller - Handles equipment owner onboarding and automated payouts
 * 
 * Flow:
 * 1. Owner creates Stripe Connect account (Express account)
 * 2. Owner completes onboarding (bank details, KYC)
 * 3. When order is marked "Returned", backend automatically triggers transfer
 * 4. Stripe transfers owner's portion to their bank (2-7 business days)
 * 5. Platform fee stays in main Stripe account
 */

/**
 * Create Stripe Connect account for equipment owner
 * POST /stripe-connect/create-account
 */
exports.createConnectAccount = async (req, res) => {
  try {
    const userId = req.userId; // From JWT middleware
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check if user already has a Stripe Connect account
    if (user.stripe_connect.account_id) {
      // If account exists but onboarding not completed, regenerate onboarding link
      if (!user.stripe_connect.onboarding_completed) {
        const stripe = await getStripeInstance();
        const accountLink = await stripe.accountLinks.create({
          account: user.stripe_connect.account_id,
          refresh_url: `https://opeec.azurewebsites.net/stripe-connect/refresh`,
          return_url: `https://opeec.azurewebsites.net/stripe-connect/success`,
          type: 'account_onboarding'
        });

        user.stripe_connect.onboarding_url = accountLink.url;
        await user.save();

        return res.status(200).json({
          success: true,
          message: 'Account exists, onboarding link refreshed',
          account_id: user.stripe_connect.account_id,
          onboarding_url: accountLink.url,
          onboarding_completed: false
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Stripe Connect account already exists and is active',
        account_id: user.stripe_connect.account_id,
        onboarding_completed: true,
        account_status: user.stripe_connect.account_status
      });
    }

    // Create new Stripe Express Connect account
    const stripe = await getStripeInstance();
    const account = await stripe.accounts.create({
      type: 'express',
      country: req.body.country || 'US', // Default to US, can be changed
      email: user.email,
      capabilities: {
        card_payments: { requested: true }, // Owner doesn't accept payments
        transfers: { requested: true }        // Owner receives transfers
      },
      business_type: 'individual',
      metadata: {
        user_id: userId.toString(),
        user_name: user.name,
        user_email: user.email
      }
    });

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `https://opeec.azurewebsites.net/stripe-connect/refresh`,
      return_url: `https://opeec.azurewebsites.net/stripe-connect/success`,
      type: 'account_onboarding'
    });

    // Update user with Stripe Connect information
    user.stripe_connect = {
      account_id: account.id,
      account_status: 'pending',
      onboarding_completed: false,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      onboarding_url: accountLink.url,
      last_updated: new Date()
    };

    await user.save();

    console.log(`✅ Stripe Connect account created for user ${userId}: ${account.id}`);

    // Send admin notification
    await createAdminNotification({
      type: 'STRIPE_CONNECT_ACCOUNT_CREATED',
      message: `${user.name} (${user.email}) started Stripe Connect onboarding`,
      metadata: {
        user_id: userId.toString(),
        stripe_account_id: account.id
      }
    });

    res.status(201).json({
      success: true,
      message: 'Stripe Connect account created successfully',
      account_id: account.id,
      onboarding_url: accountLink.url,
      onboarding_completed: false
    });

  } catch (error) {
    console.error('❌ Error creating Stripe Connect account:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create Stripe Connect account', 
      error: error.message 
    });
  }
};

/**
 * Get Stripe Connect account status for current user
 * GET /stripe-connect/account-status
 */
exports.getAccountStatus = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // If no Stripe Connect account exists
    if (!user.stripe_connect.account_id) {
      return res.status(200).json({
        success: true,
        connected: false,
        account_id: null,
        onboarding_completed: false,
        payouts_enabled: false,
        message: 'No Stripe Connect account found. Create one to receive payouts.'
      });
    }

    // Fetch latest account status from Stripe
    const stripe = await getStripeInstance();
    const account = await stripe.accounts.retrieve(user.stripe_connect.account_id);

    // Update user record with latest status
    user.stripe_connect.charges_enabled = account.charges_enabled;
    user.stripe_connect.payouts_enabled = account.payouts_enabled;
    user.stripe_connect.details_submitted = account.details_submitted;
    user.stripe_connect.onboarding_completed = account.details_submitted && account.payouts_enabled;
    user.stripe_connect.account_status = account.payouts_enabled ? 'active' : 'pending';
    user.stripe_connect.last_updated = new Date();

    await user.save();

    console.log(`📊 Stripe Connect status retrieved for user ${userId}: ${account.id}`);

    res.status(200).json({
      success: true,
      connected: true,
      account_id: account.id,
      onboarding_completed: user.stripe_connect.onboarding_completed,
      payouts_enabled: account.payouts_enabled,
      charges_enabled: account.charges_enabled,
      details_submitted: account.details_submitted,
      account_status: user.stripe_connect.account_status,
      requirements: {
        currently_due: account.requirements?.currently_due || [],
        eventually_due: account.requirements?.eventually_due || [],
        past_due: account.requirements?.past_due || []
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving Stripe Connect account status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve account status', 
      error: error.message 
    });
  }
};

/**
 * Refresh onboarding link if expired
 * POST /stripe-connect/refresh-onboarding
 */
exports.refreshOnboardingLink = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    if (!user.stripe_connect.account_id) {
      return res.status(400).json({
        success: false,
        message: 'No Stripe Connect account found. Create one first.'
      });
    }

    // Create new onboarding link
    const stripe = await getStripeInstance();
    const accountLink = await stripe.accountLinks.create({
      account: user.stripe_connect.account_id,
      refresh_url: `https://opeec.azurewebsites.net/stripe-connect/refresh`,
      return_url: `https://opeec.azurewebsites.net/stripe-connect/success`,
      type: 'account_onboarding'
    });

    user.stripe_connect.onboarding_url = accountLink.url;
    await user.save();

    console.log(`🔄 Onboarding link refreshed for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Onboarding link refreshed successfully',
      onboarding_url: accountLink.url
    });

  } catch (error) {
    console.error('❌ Error refreshing onboarding link:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to refresh onboarding link', 
      error: error.message 
    });
  }
};

/**
 * Trigger Stripe transfer to equipment owner (Called internally after order "Returned")
 * This is an internal function, not an API endpoint
 * 
 * @param {string} orderId - Order ID to process payout for
 * @returns {Promise<Object>} Transfer result
 */
exports.triggerAutomaticPayout = async (orderId) => {
  try {
    console.log(`💰 Triggering automatic Stripe payout for order: ${orderId}`);

    // Get order with equipment and owner information
    const order = await Order.findById(orderId)
      .populate('equipmentId', 'ownerId title')
      .lean();

    if (!order) {
      throw new Error('Order not found');
    }

    const ownerId = order.equipmentId.ownerId;
    const owner = await User.findById(ownerId);

    if (!owner) {
      throw new Error('Equipment owner not found');
    }

    // Validate owner has active Stripe Connect account
    if (!owner.stripe_connect.account_id) {
      throw new Error('Owner does not have a Stripe Connect account');
    }

    if (!owner.stripe_connect.payouts_enabled) {
      throw new Error('Owner has not completed Stripe Connect onboarding');
    }

    // Check if transfer already exists
    if (order.stripe_payout?.transfer_id) {
      console.log(`⚠️ Transfer already exists for order ${orderId}: ${order.stripe_payout.transfer_id}`);
      return {
        success: false,
        message: 'Transfer already processed',
        transfer_id: order.stripe_payout.transfer_id
      };
    }

    // Calculate transfer amount (rental_fee - platform_fee - any penalties)
    const transferAmount = order.rental_fee - (order.penalty_amount || 0);

    if (transferAmount <= 0) {
      console.log(`⚠️ Transfer amount is zero or negative for order ${orderId}, skipping transfer`);
      return {
        success: false,
        message: 'Transfer amount is zero or negative',
        transfer_amount: transferAmount
      };
    }

    // Create Stripe Transfer
    const stripe = await getStripeInstance();
    const transfer = await stripe.transfers.create({
      amount: Math.round(transferAmount * 100), // Convert to cents
      currency: 'usd',
      destination: owner.stripe_connect.account_id,
      transfer_group: `order_${orderId}`,
      description: `Rental payout for order ${orderId} - ${order.equipmentId.title}`,
      metadata: {
        order_id: orderId.toString(),
        equipment_id: order.equipmentId._id.toString(),
        owner_id: ownerId.toString(),
        rental_fee: order.rental_fee,
        platform_fee: order.platform_fee,
        penalty_amount: order.penalty_amount || 0,
        transfer_amount: transferAmount
      }
    });

    console.log(`✅ Stripe transfer created: ${transfer.id} for $${transferAmount}`);

    // Update order with transfer information
    await Order.findByIdAndUpdate(orderId, {
      'stripe_payout.transfer_id': transfer.id,
      'stripe_payout.transfer_status': 'processing',
      'stripe_payout.transfer_amount': transferAmount,
      'stripe_payout.transfer_triggered_at': new Date(),
      'stripe_payout.destination_account_id': owner.stripe_connect.account_id
    });

    // Create transaction log entry (deduct from wallet)
    await createTransaction({
      sellerId: ownerId,
      type: 'STRIPE_PAYOUT',
      amount: -transferAmount, // Negative = deduction from wallet
      description: `Stripe payout for order ${orderId}`,
      orderId: orderId,
      status: 'completed',
      metadata: {
        stripe_transfer_id: transfer.id,
        destination_account: owner.stripe_connect.account_id,
        equipment_title: order.equipmentId.title,
        rental_dates: {
          start_date: order.rental_schedule.start_date,
          end_date: order.rental_schedule.end_date
        }
      }
    });

    // Send admin notification
    await createAdminNotification({
      type: 'STRIPE_TRANSFER_INITIATED',
      message: `Automatic payout of $${transferAmount} initiated for ${owner.name} - Order ${orderId}`,
      metadata: {
        order_id: orderId.toString(),
        owner_id: ownerId.toString(),
        transfer_id: transfer.id,
        transfer_amount: transferAmount
      }
    });

    console.log(`💸 Stripe payout successfully triggered for order ${orderId}`);

    return {
      success: true,
      transfer_id: transfer.id,
      transfer_amount: transferAmount,
      owner_id: ownerId,
      owner_name: owner.name,
      stripe_account_id: owner.stripe_connect.account_id,
      message: 'Payout initiated successfully'
    };

  } catch (error) {
    console.error('❌ Error triggering automatic payout:', error);

    // Update order with failure information
    await Order.findByIdAndUpdate(orderId, {
      'stripe_payout.transfer_status': 'failed',
      'stripe_payout.transfer_failure_reason': error.message,
      'stripe_payout.transfer_triggered_at': new Date()
    });

    // Send admin notification about failure
    await createAdminNotification({
      type: 'STRIPE_TRANSFER_FAILED',
      message: `Automatic payout failed for order ${orderId}: ${error.message}`,
      metadata: {
        order_id: orderId.toString(),
        error: error.message
      }
    });

    throw error;
  }
};

/**
 * Get user's payout history
 * GET /stripe-connect/payout-history
 */
exports.getPayoutHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 20 } = req.query;

    // Find all orders where user is the equipment owner and has received payouts
    const equipment = await Equipment.find({ ownerId: userId }).select('_id');
    const equipmentIds = equipment.map(e => e._id);

    const orders = await Order.find({
      equipmentId: { $in: equipmentIds },
      'stripe_payout.transfer_id': { $ne: "" }
    })
    .select('equipmentId rental_fee platform_fee penalty_amount stripe_payout createdAt')
    .populate('equipmentId', 'title images')
    .sort({ 'stripe_payout.transfer_triggered_at': -1 })
    .limit(parseInt(limit))
    .lean();

    const payoutHistory = orders.map(order => ({
      order_id: order._id,
      equipment_title: order.equipmentId.title,
      equipment_image: order.equipmentId.images?.[0] || '',
      rental_fee: order.rental_fee,
      platform_fee: order.platform_fee,
      penalty_amount: order.penalty_amount || 0,
      transfer_amount: order.stripe_payout.transfer_amount,
      transfer_status: order.stripe_payout.transfer_status,
      transfer_id: order.stripe_payout.transfer_id,
      transfer_date: order.stripe_payout.transfer_triggered_at,
      completed_date: order.stripe_payout.transfer_completed_at
    }));

    res.status(200).json({
      success: true,
      payout_history: payoutHistory,
      total_count: payoutHistory.length
    });

  } catch (error) {
    console.error('❌ Error retrieving payout history:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve payout history', 
      error: error.message 
    });
  }
};

// All functions are exported individually using exports.functionName above

