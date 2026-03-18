const { getStripeInstance } = require('../utils/stripeIdentity');
const User = require('../models/user');
const Order = require('../models/orders');
const Equipment = require('../models/equipment');
const { createTransaction } = require('../utils/walletService');
const { createAdminNotification } = require('./adminNotificationController');

/** Check if Stripe error means this Connect account is unusable (clear and allow new account) */
function isNoSuchAccountError(err) {
  const msg = (err.message || '').toLowerCase();
  const code = err.code || err.type || '';
  return (
    code === 'resource_missing' ||
    code === 'account_invalid' ||
    msg.includes('no such account') ||
    msg.includes('account does not exist') ||
    msg.includes('does not have access to account') ||
    msg.includes('application access may have been revoked')
  );
}

/** Get dynamic base URL for Connect return/refresh (dev vs prod) */
function getConnectBaseUrl() {
  const base = process.env.BASE_URL || process.env.BACKEND_URL || 'https://opeec.azurewebsites.net';
  return base.replace(/\/$/, '');
}

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

    console.log('━'.repeat(80));
    console.log('🔵 CREATE STRIPE CONNECT ACCOUNT REQUEST');
    console.log('━'.repeat(80));
    console.log(`📋 User ID: ${userId}`);
    console.log(`📋 Email: ${user?.email}`);
    console.log(`📋 Current Account ID: ${user?.stripe_connect?.account_id || 'NONE'}`);
    console.log(`📋 Current Status: ${user?.stripe_connect?.account_status || 'NONE'}`);
    console.log(`📋 Onboarding Completed: ${user?.stripe_connect?.onboarding_completed || false}`);
    console.log('━'.repeat(80));

    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check if user already has a Stripe Connect account
    if (user.stripe_connect?.account_id) {
      // If account exists but onboarding not completed, ALWAYS generate a fresh link
      // ⚠️ IMPORTANT: Stripe onboarding links are SINGLE-USE and expire after being opened
      // Never cache/reuse links - always generate fresh ones
      if (!user.stripe_connect.onboarding_completed) {
        const stripe = await getStripeInstance();
        const baseUrl = getConnectBaseUrl();

        try {
          console.log(`🔄 Creating fresh onboarding link for user ${userId} (account exists, onboarding incomplete)`);

          const accountLink = await stripe.accountLinks.create({
            account: user.stripe_connect.account_id,
            refresh_url: `${baseUrl}/stripe-connect/refresh`,
            return_url: `${baseUrl}/stripe-connect/success`,
            type: 'account_onboarding'
          });

          user.stripe_connect.onboarding_url = accountLink.url;
          user.stripe_connect.onboarding_url_created_at = new Date();
          await user.save();

          return res.status(200).json({
            success: true,
            message: 'Fresh onboarding link generated',
            account_id: user.stripe_connect.account_id,
            onboarding_url: accountLink.url,
            onboarding_completed: false
          });
        } catch (linkErr) {
          // Stale account: created in different Stripe mode or deleted → create new
          if (isNoSuchAccountError(linkErr)) {
            console.log(`⚠️ Stale Connect account (${user.stripe_connect.account_id}) not found in Stripe - creating new account`);
            user.stripe_connect.account_id = '';
            user.stripe_connect.account_status = 'not_connected';
            user.stripe_connect.onboarding_completed = false;
            user.stripe_connect.onboarding_url = '';
            await user.save();
            // Fall through to create new account below
          } else {
            throw linkErr;
          }
        }
      }

      if (user.stripe_connect?.account_id) {
        return res.status(200).json({
          success: true,
          message: 'Stripe Connect account already exists and is active',
          account_id: user.stripe_connect.account_id,
          onboarding_completed: true,
          account_status: user.stripe_connect.account_status
        });
      }
    }

    // Create new Stripe Express Connect account
    const stripe = await getStripeInstance();
    let account;
    let accountLink;
    
    try {
      account = await stripe.accounts.create({
        type: 'express',
        country: req.body.country || 'US',
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        business_type: 'individual',
        business_profile: {
          mcc: '7523',  // Passenger Car Rental - Equipment rental MCC
          product_description: 'Equipment rental marketplace',
          url: 'https://opeec.azurewebsites.net'
        },
        metadata: {
          user_id: userId.toString(),
          user_name: user.name,
          user_email: user.email
        }
      });
      console.log('━'.repeat(80));
      console.log('✅ STRIPE ACCOUNT CREATED');
      console.log('━'.repeat(80));
      console.log(`   Account ID: ${account.id}`);
      console.log(`   Type: ${account.type}`);
      console.log(`   Country: ${account.country}`);
      console.log(`   Email: ${account.email}`);
      console.log(`   Capabilities: ${JSON.stringify(account.capabilities)}`);
      console.log('━'.repeat(80));
    } catch (accountError) {
      console.error('❌ Failed to create Stripe Connect account:', accountError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create Stripe Connect account',
        error: accountError.message,
        error_code: 'stripe_account_creation_failed'
      });
    }

    // Create Person (representative) - REQUIRED to avoid "User not found" / "Provide a representative" past-due
    // Stripe docs: "After creating the Account, create a Person with relationship.representative = true"
    const nameParts = (user.name || 'User').trim().split(/\s+/);
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || 'Account';
    try {
      await stripe.accounts.createPerson(account.id, {
        first_name: firstName,
        last_name: lastName,
        relationship: { representative: true },
      });
      console.log(`✅ Person (representative) created for account ${account.id}`);
    } catch (personError) {
      console.error('❌ Failed to create Person:', personError);
      try {
        await stripe.accounts.del(account.id);
      } catch (_) {}
      return res.status(500).json({
        success: false,
        message: 'Failed to set up account representative',
        error: personError.message,
        error_code: 'person_creation_failed'
      });
    }

    // Create onboarding link with error handling
    const baseUrl = getConnectBaseUrl();
    try {
      accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${baseUrl}/stripe-connect/refresh`,
        return_url: `${baseUrl}/stripe-connect/success`,
        type: 'account_onboarding'
      });
      console.log('━'.repeat(80));
      console.log('✅ ONBOARDING LINK CREATED');
      console.log('━'.repeat(80));
      console.log(`   URL: ${accountLink.url}`);
      console.log(`   Created: ${new Date().toISOString()}`);
      console.log(`   Expires: ${new Date(Date.now() + 5 * 60 * 1000).toISOString()} (5 min)`);
      console.log(`   Refresh URL: ${baseUrl}/stripe-connect/refresh`);
      console.log(`   Return URL: ${baseUrl}/stripe-connect/success`);
      console.log('━'.repeat(80));
    } catch (linkError) {
      console.error('❌ Failed to create onboarding link:', linkError);
      
      // Check if it's a rate limit error (429)
      if (linkError.statusCode === 429 || linkError.code === 'rate_limit') {
        // Don't rollback the account - it's valid, just rate limited
        return res.status(429).json({
          success: false,
          message: 'Stripe rate limit reached. Please wait a moment and try again.',
          error: 'Rate limit exceeded',
          error_code: 'stripe_rate_limit',
          account_id: account.id, // Keep the account
          retry_after: 60 // Suggest retry after 60 seconds
        });
      }
      
      // For other errors, rollback the account
      // CRITICAL: Rollback - Delete the Stripe account if link creation fails
      try {
        await stripe.accounts.del(account.id);
        console.log(`🔄 Rolled back Stripe account ${account.id} due to link creation failure`);
      } catch (rollbackError) {
        console.error('❌ Failed to rollback Stripe account:', rollbackError);
        // Log for admin intervention - account is orphaned
        await createAdminNotification({
          type: 'STRIPE_CONNECT_ORPHANED',
          message: `⚠️ CRITICAL: Orphaned Stripe Connect account ${account.id} for user ${userId} - Link creation failed`,
          metadata: {
            user_id: userId.toString(),
            account_id: account.id,
            error: linkError.message
          }
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to create onboarding link',
        error: linkError.message,
        error_code: 'onboarding_link_creation_failed',
        account_rolled_back: true
      });
    }

    // Update user with Stripe Connect information
    user.stripe_connect = {
      account_id: account.id,
      account_status: 'pending',
      onboarding_completed: false,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      onboarding_url: accountLink.url,
      onboarding_url_created_at: new Date(), // Track when link was created
      last_updated: new Date()
    };

    // Save to database with error handling and rollback
    try {
      await user.save();
      console.log(`✅ Stripe Connect account saved to database: ${account.id}`);
    } catch (dbError) {
      console.error('❌ Database save failed after Stripe account creation:', dbError);
      
      // CRITICAL: Rollback - Delete the Stripe account if DB save fails
      try {
        await stripe.accounts.del(account.id);
        console.log(`🔄 Rolled back Stripe account ${account.id} due to DB save failure`);
      } catch (rollbackError) {
        console.error('❌ Failed to rollback Stripe account:', rollbackError);
        // Log for admin intervention - account is orphaned
        await createAdminNotification({
          type: 'STRIPE_CONNECT_ORPHANED',
          message: `⚠️ CRITICAL: Orphaned Stripe Connect account ${account.id} for user ${userId} - DB save failed`,
          metadata: {
            user_id: userId.toString(),
            account_id: account.id,
            error: dbError.message
          }
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to save Stripe Connect account',
        error: dbError.message,
        error_code: 'database_save_failed',
        account_rolled_back: true
      });
    }

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
    let account;
    try {
      account = await stripe.accounts.retrieve(user.stripe_connect.account_id);
    } catch (retrieveErr) {
      if (isNoSuchAccountError(retrieveErr)) {
        user.stripe_connect.account_id = '';
        user.stripe_connect.account_status = 'not_connected';
        user.stripe_connect.onboarding_completed = false;
        await user.save();
        return res.status(200).json({
          success: true,
          connected: false,
          account_id: null,
          onboarding_completed: false,
          payouts_enabled: false,
          message: 'Previous Connect account no longer exists. Create a new one to receive payouts.'
        });
      }
      throw retrieveErr;
    }

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
    const baseUrl = getConnectBaseUrl();
    let accountLink;
    try {
      accountLink = await stripe.accountLinks.create({
        account: user.stripe_connect.account_id,
        refresh_url: `${baseUrl}/stripe-connect/refresh`,
        return_url: `${baseUrl}/stripe-connect/success`,
        type: 'account_onboarding'
      });
    } catch (linkErr) {
      if (isNoSuchAccountError(linkErr)) {
        user.stripe_connect.account_id = '';
        user.stripe_connect.account_status = 'not_connected';
        user.stripe_connect.onboarding_completed = false;
        await user.save();
        return res.status(400).json({
          success: false,
          message: 'Your previous Connect account no longer exists. Please create a new one.',
          error_code: 'stale_account',
          create_new: true
        });
      }
      throw linkErr;
    }

    user.stripe_connect.onboarding_url = accountLink.url;
    user.stripe_connect.onboarding_url_created_at = new Date(); // Track when link was created
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
      .populate('equipmentId', 'ownerId name')
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

    // Client spec: Owner receives full base (rental_fee + late_base). Platform absorbs Stripe.
    const rentalFee = Number(order.rental_fee) || 0;
    const penaltyAmount = order.penalty_amount || 0;
    const includePenalty = order.penalty_apply && penaltyAmount > 0;

    const transferAmount = Math.max(0, Math.round((rentalFee + (includePenalty ? penaltyAmount : 0)) * 100) / 100);

    console.log(`   Rental: $${rentalFee}, Penalty: $${includePenalty ? penaltyAmount : 0} → Transfer: $${transferAmount}`);

    if (transferAmount <= 0) {
      console.log(`⚠️ Transfer amount is zero or negative for order ${orderId}, skipping transfer`);
      return {
        success: false,
        message: 'Transfer amount is zero or negative',
        transfer_amount: transferAmount
      };
    }

    // Create Stripe Transfer
    // Use source_transaction (Charge ID) to link transfer to the original payment - avoids balance_insufficient
    // when funds are still "pending" (2-7 days). Without it, Stripe uses available balance only.
    const stripe = await getStripeInstance();
    const transferAmountCents = Math.round(transferAmount * 100);
    const transferCurrency = 'usd';

    let sourceTransaction = null;
    const paymentIntentId = order.stripe_payment?.payment_intent_id;
    if (paymentIntentId) {
      try {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        sourceTransaction = intent.latest_charge;
        if (sourceTransaction) {
          console.log(`   Linking transfer to charge: ${sourceTransaction}`);
        }
      } catch (piErr) {
        console.warn('Could not retrieve PaymentIntent for source_transaction:', piErr.message);
      }
    }

    // Pre-check: log available balance when not using source_transaction
    if (!sourceTransaction) {
      try {
        const balance = await stripe.balance.retrieve();
        const availableForCurrency = (balance.available || []).find((b) => (b.currency || '').toLowerCase() === transferCurrency);
        const availableCents = availableForCurrency ? availableForCurrency.amount : 0;
        if (availableCents < transferAmountCents) {
          console.warn(
            `⚠️ Stripe available balance (${transferCurrency}) is ${(availableCents / 100).toFixed(2)} ` +
            `but transfer requires ${(transferAmountCents / 100).toFixed(2)}. ` +
            `No source_transaction - order may be missing payment_intent_id.`
          );
        }
      } catch (balanceErr) {
        console.warn('Could not retrieve Stripe balance (proceeding with transfer):', balanceErr.message);
      }
    }

    const transferParams = {
      amount: transferAmountCents,
      currency: transferCurrency,
      destination: owner.stripe_connect.account_id,
      transfer_group: `order_${orderId}`,
      description: `Rental payout for order ${orderId} - ${order.equipmentId?.name || order.equipmentId?.title || 'Equipment'}`,
      metadata: {
        order_id: orderId.toString(),
        equipment_id: order.equipmentId._id.toString(),
        owner_id: ownerId.toString(),
        rental_fee: order.rental_fee,
        penalty_amount: order.penalty_amount || 0,
        transfer_amount: transferAmount
      }
    };
    if (sourceTransaction) {
      transferParams.source_transaction = sourceTransaction;
    }

    const transfer = await stripe.transfers.create(transferParams);

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
        equipment_title: order.equipmentId?.name || order.equipmentId?.title,
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

    // Clearer message when Stripe says "insufficient funds" (usually pending vs available balance)
    const isInsufficientFunds = (error.code === 'balance_insufficient' || (error.message || '').toLowerCase().includes('insufficient'));
    const failureMessage = isInsufficientFunds
      ? `Automatic payout failed for order ${orderId}: insufficient *available* balance. ` +
        `The rental charge is often "pending" until its "Available on" date in Stripe Dashboard → Transactions. ` +
        `Transfers use only available balance, not pending. Test mode: use card 4000000000000077 for immediate available funds, or wait until the charge's available date.`
      : `Automatic payout failed for order ${orderId}: ${error.message}`;

    await createAdminNotification({
      type: 'STRIPE_TRANSFER_FAILED',
      message: failureMessage,
      metadata: {
        order_id: orderId.toString(),
        error: error.message,
        code: error.code
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

