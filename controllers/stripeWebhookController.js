const { getStripeInstance, constructWebhookEvent } = require('../utils/stripeIdentity');
const Order = require('../models/orders');
const User = require('../models/user');
const { createAdminNotification } = require('./adminNotificationController');

/**
 * Stripe Connect Webhook Controller
 * Handles webhook events from Stripe for Connect accounts and transfers
 * 
 * Events handled:
 * - account.updated: When owner completes/updates onboarding
 * - transfer.created: When transfer is initiated
 * - transfer.paid: When transfer completes successfully
 * - transfer.failed: When transfer fails
 * - payout.paid: When owner receives money in their bank
 * - payout.failed: When payout to owner's bank fails
 */

/**
 * Main webhook handler
 * POST /webhooks/stripe-connect
 */
exports.handleStripeConnectWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature using existing utility
    event = await constructWebhookEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`📨 Stripe webhook received: ${event.type}`);

  // Handle the event
  try {
    switch (event.type) {
      case 'account.updated':
        await handleAccountUpdated(event.data.object);
        break;

      case 'account.application.authorized':
        await handleAccountAuthorized(event.data.object);
        break;

      case 'account.application.deauthorized':
        await handleAccountDeauthorized(event.data.object);
        break;

      case 'transfer.created':
        await handleTransferCreated(event.data.object);
        break;

      case 'transfer.paid':
        await handleTransferPaid(event.data.object);
        break;

      case 'transfer.failed':
        await handleTransferFailed(event.data.object);
        break;

      case 'transfer.reversed':
        await handleTransferReversed(event.data.object);
        break;

      case 'payout.paid':
        await handlePayoutPaid(event.data.object);
        break;

      case 'payout.failed':
        await handlePayoutFailed(event.data.object);
        break;

      default:
        console.log(`⚠️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

/**
 * Handle account.updated event
 * Updates user's Stripe Connect status when they complete onboarding
 */
async function handleAccountUpdated(account) {
  try {
    console.log(`🔄 Account updated: ${account.id}`);

    const user = await User.findOne({ 'stripe_connect.account_id': account.id });
    
    if (!user) {
      console.error(`❌ User not found for Stripe account: ${account.id}`);
      return;
    }

    // Update user's Stripe Connect status
    user.stripe_connect.charges_enabled = account.charges_enabled;
    user.stripe_connect.payouts_enabled = account.payouts_enabled;
    user.stripe_connect.details_submitted = account.details_submitted;
    user.stripe_connect.onboarding_completed = account.details_submitted && account.payouts_enabled;
    user.stripe_connect.account_status = account.payouts_enabled ? 'active' : 'pending';
    user.stripe_connect.last_updated = new Date();

    await user.save();

    console.log(`✅ User ${user._id} Stripe status updated: ${user.stripe_connect.account_status}`);

    // Send real-time socket notification to user
    const { sendEventToUser } = require('../utils/socketService');
    sendEventToUser(user._id.toString(), 'stripeConnectStatusResponse', {
      connected: !!user.stripe_connect.account_id,
      account_id: user.stripe_connect.account_id,
      account_status: user.stripe_connect.account_status,
      onboarding_completed: user.stripe_connect.onboarding_completed,
      payouts_enabled: user.stripe_connect.payouts_enabled,
      charges_enabled: user.stripe_connect.charges_enabled,
      details_submitted: user.stripe_connect.details_submitted,
      last_updated: user.stripe_connect.last_updated,
      timestamp: new Date().toISOString()
    });

    // Send admin notification if onboarding completed
    if (user.stripe_connect.onboarding_completed) {
      await createAdminNotification({
        type: 'STRIPE_CONNECT_ONBOARDING_COMPLETED',
        message: `${user.name} (${user.email}) completed Stripe Connect onboarding`,
        metadata: {
          user_id: user._id.toString(),
          stripe_account_id: account.id
        }
      });
    }

  } catch (error) {
    console.error('❌ Error handling account.updated:', error);
    throw error;
  }
}

/**
 * Handle account.application.authorized event
 */
async function handleAccountAuthorized(account) {
  console.log(`✅ Account authorized: ${account.id}`);
  // Can add additional logic here if needed
}

/**
 * Handle account.application.deauthorized event
 */
async function handleAccountDeauthorized(account) {
  try {
    console.log(`⚠️ Account deauthorized: ${account.id}`);

    const user = await User.findOne({ 'stripe_connect.account_id': account.id });
    
    if (user) {
      user.stripe_connect.account_status = 'disabled';
      await user.save();

      await createAdminNotification({
        type: 'STRIPE_CONNECT_ACCOUNT_DEAUTHORIZED',
        message: `${user.name}'s Stripe Connect account was deauthorized`,
        metadata: {
          user_id: user._id.toString(),
          stripe_account_id: account.id
        }
      });
    }

  } catch (error) {
    console.error('❌ Error handling account.deauthorized:', error);
  }
}

/**
 * Handle transfer.created event
 * Transfer has been created and is being processed
 */
async function handleTransferCreated(transfer) {
  try {
    console.log(`💸 Transfer created: ${transfer.id} - $${transfer.amount / 100}`);

    const orderId = transfer.metadata?.order_id;
    if (!orderId) {
      console.log('⚠️ No order_id in transfer metadata');
      return;
    }

    await Order.findByIdAndUpdate(orderId, {
      'stripe_payout.transfer_status': 'processing'
    });

    console.log(`✅ Order ${orderId} transfer status updated to processing`);

  } catch (error) {
    console.error('❌ Error handling transfer.created:', error);
  }
}

/**
 * Handle transfer.paid event
 * Transfer successfully completed to owner's Stripe account
 */
async function handleTransferPaid(transfer) {
  try {
    console.log(`✅ Transfer paid: ${transfer.id} - $${transfer.amount / 100}`);

    const orderId = transfer.metadata?.order_id;
    const ownerId = transfer.metadata?.owner_id;

    if (!orderId) {
      console.log('⚠️ No order_id in transfer metadata');
      return;
    }

    // Update order with completed transfer status
    await Order.findByIdAndUpdate(orderId, {
      'stripe_payout.transfer_status': 'completed',
      'stripe_payout.transfer_completed_at': new Date()
    });

    console.log(`✅ Order ${orderId} transfer completed`);

    // Get owner and send admin notification
    if (ownerId) {
      const owner = await User.findById(ownerId);
      if (owner) {
        await createAdminNotification({
          type: 'STRIPE_TRANSFER_COMPLETED',
          message: `Transfer of $${transfer.amount / 100} completed to ${owner.name} for order ${orderId}`,
          metadata: {
            order_id: orderId,
            owner_id: ownerId,
            transfer_id: transfer.id,
            amount: transfer.amount / 100
          }
        });
      }
    }

  } catch (error) {
    console.error('❌ Error handling transfer.paid:', error);
  }
}

/**
 * Handle transfer.failed event
 * Transfer failed - needs admin attention
 */
async function handleTransferFailed(transfer) {
  try {
    console.error(`❌ Transfer failed: ${transfer.id} - ${transfer.failure_message}`);

    const orderId = transfer.metadata?.order_id;
    const ownerId = transfer.metadata?.owner_id;

    if (!orderId) {
      console.log('⚠️ No order_id in transfer metadata');
      return;
    }

    // Update order with failed status
    await Order.findByIdAndUpdate(orderId, {
      'stripe_payout.transfer_status': 'failed',
      'stripe_payout.transfer_failure_reason': transfer.failure_message || 'Unknown error'
    });

    console.log(`❌ Order ${orderId} transfer marked as failed`);

    // Send urgent admin notification
    const owner = ownerId ? await User.findById(ownerId) : null;
    await createAdminNotification({
      type: 'STRIPE_TRANSFER_FAILED',
      message: `⚠️ URGENT: Transfer failed for order ${orderId} - ${transfer.failure_message}`,
      metadata: {
        order_id: orderId,
        owner_id: ownerId,
        owner_name: owner?.name || 'Unknown',
        transfer_id: transfer.id,
        amount: transfer.amount / 100,
        failure_reason: transfer.failure_message
      }
    });

  } catch (error) {
    console.error('❌ Error handling transfer.failed:', error);
  }
}

/**
 * Handle transfer.reversed event
 * Transfer was reversed (refunded back from owner)
 */
async function handleTransferReversed(transfer) {
  try {
    console.error(`🔄 Transfer reversed: ${transfer.id}`);

    const orderId = transfer.metadata?.order_id;

    if (orderId) {
      await Order.findByIdAndUpdate(orderId, {
        'stripe_payout.transfer_status': 'cancelled'
      });

      await createAdminNotification({
        type: 'STRIPE_TRANSFER_REVERSED',
        message: `Transfer reversed for order ${orderId}`,
        metadata: {
          order_id: orderId,
          transfer_id: transfer.id,
          amount: transfer.amount / 100
        }
      });
    }

  } catch (error) {
    console.error('❌ Error handling transfer.reversed:', error);
  }
}

/**
 * Handle payout.paid event
 * Money successfully reached owner's bank account
 */
async function handlePayoutPaid(payout) {
  try {
    console.log(`🏦 Payout paid: ${payout.id} - $${payout.amount / 100} to bank`);

    // This is informational - owner has received money in their bank
    // Can be used for additional notifications or tracking

    const destinationAccountId = payout.destination;
    const user = await User.findOne({ 'stripe_connect.account_id': destinationAccountId });

    if (user) {
      console.log(`💰 ${user.name} received $${payout.amount / 100} in their bank account`);
      
      // Optional: Send notification to admin
      await createAdminNotification({
        type: 'STRIPE_PAYOUT_TO_BANK_COMPLETED',
        message: `${user.name} received $${payout.amount / 100} payout in their bank`,
        metadata: {
          user_id: user._id.toString(),
          payout_id: payout.id,
          amount: payout.amount / 100,
          arrival_date: payout.arrival_date
        }
      });
    }

  } catch (error) {
    console.error('❌ Error handling payout.paid:', error);
  }
}

/**
 * Handle payout.failed event
 * Payout to owner's bank failed - needs admin attention
 */
async function handlePayoutFailed(payout) {
  try {
    console.error(`❌ Payout failed: ${payout.id} - ${payout.failure_message}`);

    const destinationAccountId = payout.destination;
    const user = await User.findOne({ 'stripe_connect.account_id': destinationAccountId });

    if (user) {
      // Send urgent admin notification
      await createAdminNotification({
        type: 'STRIPE_PAYOUT_TO_BANK_FAILED',
        message: `⚠️ URGENT: Bank payout failed for ${user.name} - ${payout.failure_message}`,
        metadata: {
          user_id: user._id.toString(),
          payout_id: payout.id,
          amount: payout.amount / 100,
          failure_reason: payout.failure_message,
          failure_code: payout.failure_code
        }
      });
    }

  } catch (error) {
    console.error('❌ Error handling payout.failed:', error);
  }
}

// All functions are exported individually using exports.functionName above

