const { getStripeInstance } = require('../utils/stripeIdentity');
const Order = require('../models/orders');
const User = require('../models/user');
const Equipment = require('../models/equipment');
const { createAdminNotification } = require('./adminNotificationController');

/**
 * Payment Controller - Handles Stripe payment collection, refunds, and late penalty charging
 * 
 * Flow:
 * 1. Customer creates payment intent before booking
 * 2. Frontend shows Stripe payment sheet
 * 3. Customer completes payment
 * 4. Backend confirms payment and creates order
 * 5. On cancellation, automatic refund processing
 * 6. On late return, automatic penalty charging
 */

/**
 * Create Payment Intent for rental booking
 * POST /payment/create-intent
 */
exports.createPaymentIntent = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      equipment_id,
      total_amount,
      platform_fee,
      rental_fee,
      owner_id
    } = req.body;

    // Validation
    if (!equipment_id || !total_amount || !platform_fee || !rental_fee || !owner_id) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields: equipment_id, total_amount, platform_fee, rental_fee, owner_id' 
      });
    }

    // Verify equipment exists
    const equipment = await Equipment.findById(equipment_id);
    if (!equipment) {
      return res.status(404).json({ 
        success: false,
        message: 'Equipment not found' 
      });
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Get owner's Stripe Connect account
    const owner = await User.findById(owner_id);
    if (!owner || !owner.stripe_connect.account_id) {
      return res.status(400).json({ 
        success: false,
        message: 'Equipment owner has not completed Stripe Connect onboarding',
        error_code: 'owner_not_onboarded'
      });
    }

    // Check if owner's Stripe account is active
    if (owner.stripe_connect.account_status !== 'active') {
      return res.status(400).json({ 
        success: false,
        message: 'Equipment owner payment account is not active',
        error_code: 'owner_account_inactive'
      });
    }

    const stripe = await getStripeInstance();

    // Create or retrieve Stripe customer for the user
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          user_id: userId,
          platform: 'OPEEC'
        }
      });
      customerId = customer.id;
      
      // Save customer ID to user
      user.stripe_customer_id = customerId;
      await user.save();
      
      console.log(`✅ Created Stripe customer ${customerId} for user ${userId}`);
    }

    // Convert amounts to cents (Stripe uses smallest currency unit)
    const amountInCents = Math.round(total_amount * 100);
    const applicationFeeInCents = Math.round(platform_fee * 100);

    // Check if owner's account is fully onboarded
    const isOwnerFullyOnboarded = owner.stripe_connect.payouts_enabled && 
                                   owner.stripe_connect.details_submitted;

    // Platform country (where OPEEC business is registered)
    // Can be overridden via environment variable if needed
    const PLATFORM_COUNTRY = process.env.STRIPE_PLATFORM_COUNTRY || 'CA'; // Default: Canada

    // Check if cross-border payment is needed
    let isCrossBorder = false;
    let connectedAccountCountry = null;
    
    if (isOwnerFullyOnboarded) {
      try {
        // Fetch connected account details from Stripe to get country
        const connectedAccount = await stripe.accounts.retrieve(owner.stripe_connect.account_id);
        connectedAccountCountry = connectedAccount.country;
        isCrossBorder = connectedAccountCountry !== PLATFORM_COUNTRY;
        console.log(`🌍 Platform country: ${PLATFORM_COUNTRY}, Connected account country: ${connectedAccountCountry}, Cross-border: ${isCrossBorder}`);
      } catch (err) {
        console.log(`⚠️ Could not fetch connected account country, assuming cross-border for safety: ${err.message}`);
        isCrossBorder = true; // Default to cross-border for safety
      }
    }

    // Create PaymentIntent (with or without Stripe Connect based on onboarding status)
    const paymentIntentParams = {
      amount: amountInCents,
      currency: 'usd',
      customer: customerId,
      metadata: {
        user_id: userId,
        equipment_id: equipment_id,
        owner_id: owner_id,
        rental_fee: rental_fee.toString(),
        platform_fee: platform_fee.toString(),
        platform: 'OPEEC',
        test_mode: isOwnerFullyOnboarded ? 'false' : 'true', // Flag for testing
        cross_border: isCrossBorder ? 'true' : 'false',
        connected_account_country: connectedAccountCountry || 'unknown'
      },
      // Enable automatic payment methods (card, etc.)
      automatic_payment_methods: {
        enabled: true,
      },
      // Save payment method for future off-session charges (late penalties)
      setup_future_usage: 'off_session',
      description: `Rental: ${equipment.name}`
    };

    // Only add Stripe Connect transfer if owner is fully onboarded
    if (isOwnerFullyOnboarded) {
      paymentIntentParams.application_fee_amount = applicationFeeInCents;
      paymentIntentParams.transfer_data = {
        destination: owner.stripe_connect.account_id,
      };
      
      // Only add on_behalf_of for cross-border payments (different countries)
      // This allows the charge to settle in the connected account's country
      if (isCrossBorder) {
        paymentIntentParams.on_behalf_of = owner.stripe_connect.account_id;
        console.log(`💰 Creating CROSS-BORDER payment with on_behalf_of to ${owner.stripe_connect.account_id} (${connectedAccountCountry})`);
      } else {
        console.log(`💰 Creating SAME-REGION payment transfer to ${owner.stripe_connect.account_id} (${connectedAccountCountry})`);
      }
    } else {
      console.log(`⚠️  Creating payment WITHOUT transfer (owner not fully onboarded - test mode)`);
      console.log(`   Owner will be credited via wallet after testing`);
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    console.log(`💳 Payment intent created: ${paymentIntent.id} for $${total_amount}`);

    return res.status(200).json({
      success: true,
      message: 'Payment intent created successfully',
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount: total_amount,
      currency: 'usd'
    });

  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
      error: error.message
    });
  }
};

/**
 * Confirm Payment Success (called by frontend after Stripe confirms payment)
 * POST /payment/confirm
 */
exports.confirmPayment = async (req, res) => {
  try {
    const { payment_intent_id } = req.body;

    if (!payment_intent_id) {
      return res.status(400).json({ 
        success: false,
        message: 'payment_intent_id is required' 
      });
    }

    const stripe = await getStripeInstance();
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ 
        success: false,
        message: 'Payment not completed',
        status: paymentIntent.status
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment confirmed',
      payment_status: paymentIntent.status,
      amount: paymentIntent.amount / 100
    });

  } catch (error) {
    console.error('❌ Error confirming payment:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to confirm payment',
      error: error.message
    });
  }
};

/**
 * Process Refund for cancelled orders
 * Internal function called by cancelOrder controller
 */
exports.processRefund = async (orderId, refundAmount, reason = 'requested_by_customer') => {
  try {
    const order = await Order.findById(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    if (!order.stripe_payment.payment_intent_id) {
      throw new Error('No payment intent found for this order');
    }

    if (order.stripe_payment.payment_status === 'refunded') {
      console.log(`⚠️ Order ${orderId} already refunded`);
      return { success: true, message: 'Already refunded', refund: null };
    }

    const stripe = await getStripeInstance();
    
    // Convert to cents
    const refundAmountInCents = Math.round(refundAmount * 100);

    // Create refund
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment.payment_intent_id,
      amount: refundAmountInCents,
      reason: reason,
      metadata: {
        order_id: orderId.toString(),
        original_amount: order.total_amount.toString(),
        refund_amount: refundAmount.toString()
      }
    });

    // Update order with refund details
    order.stripe_payment.refund_id = refund.id;
    order.stripe_payment.refund_amount = refundAmount;
    order.stripe_payment.refund_status = refund.status;
    order.stripe_payment.refund_processed_at = new Date();
    order.stripe_payment.payment_status = refundAmount >= order.total_amount ? 'refunded' : 'partially_refunded';
    
    await order.save();

    console.log(`✅ Refund processed: ${refund.id} - $${refundAmount} for order ${orderId}`);

    // Create admin notification
    try {
      await createAdminNotification(
        'order_refund_processed',
        `Refund of $${refundAmount} processed for order ${orderId}`,
        {
          orderId: orderId,
          userId: order.userId,
          equipmentId: order.equipmentId,
          data: {
            refundAmount: refundAmount,
            originalAmount: order.total_amount,
            refundId: refund.id,
            reason: reason
          }
        }
      );
    } catch (notifError) {
      console.error('Error creating refund notification:', notifError);
    }

    return {
      success: true,
      message: 'Refund processed successfully',
      refund: {
        id: refund.id,
        amount: refundAmount,
        status: refund.status
      }
    };

  } catch (error) {
    console.error(`❌ Error processing refund for order ${orderId}:`, error);
    
    // Create admin notification for failed refund
    try {
      await createAdminNotification(
        'refund_failed',
        `Failed to process refund for order ${orderId}`,
        {
          orderId: orderId,
          data: {
            refundAmount: refundAmount,
            error: error.message
          }
        }
      );
    } catch (notifError) {
      console.error('Error creating failed refund notification:', notifError);
    }

    throw error;
  }
};

/**
 * Charge Late Penalty for overdue returns
 * Internal function called by order cron job
 */
exports.chargeLatePenalty = async (orderId, penaltyAmount, daysLate) => {
  try {
    const order = await Order.findById(orderId).populate('userId').populate('equipmentId');
    
    if (!order) {
      throw new Error('Order not found');
    }

    if (!order.stripe_payment.customer_id || !order.stripe_payment.payment_method_id) {
      console.log(`⚠️ No saved payment method for order ${orderId} - cannot charge late penalty`);
      
      // Create admin notification for manual collection
      await createAdminNotification(
        'late_penalty_manual_collection',
        `Late penalty of $${penaltyAmount} requires manual collection for order ${orderId}`,
        {
          orderId: orderId,
          userId: order.userId._id,
          equipmentId: order.equipmentId._id,
          data: {
            penaltyAmount: penaltyAmount,
            daysLate: daysLate,
            reason: 'No saved payment method'
          }
        }
      );
      
      return {
        success: false,
        message: 'No saved payment method',
        requires_manual_collection: true
      };
    }

    const stripe = await getStripeInstance();
    
    // Convert to cents
    const penaltyAmountInCents = Math.round(penaltyAmount * 100);

    // Attempt off-session charge
    const paymentIntent = await stripe.paymentIntents.create({
      amount: penaltyAmountInCents,
      currency: 'usd',
      customer: order.stripe_payment.customer_id,
      payment_method: order.stripe_payment.payment_method_id,
      off_session: true,
      confirm: true,
      description: `Late penalty: ${daysLate} days overdue - Order ${orderId}`,
      metadata: {
        order_id: orderId.toString(),
        charge_type: 'late_penalty',
        days_late: daysLate.toString(),
        penalty_amount: penaltyAmount.toString()
      }
    });

    // Record the charge in order
    order.stripe_payment.late_penalty_charges.push({
      charge_id: paymentIntent.id,
      amount: penaltyAmount,
      charged_at: new Date(),
      status: paymentIntent.status
    });
    
    await order.save();

    console.log(`✅ Late penalty charged: ${paymentIntent.id} - $${penaltyAmount} for order ${orderId}`);

    // Notify admin of successful charge
    await createAdminNotification(
      'late_penalty_charged',
      `Late penalty of $${penaltyAmount} charged for order ${orderId}`,
      {
        orderId: orderId,
        userId: order.userId._id,
        equipmentId: order.equipmentId._id,
        data: {
          penaltyAmount: penaltyAmount,
          daysLate: daysLate,
          chargeId: paymentIntent.id
        }
      }
    );

    return {
      success: true,
      message: 'Late penalty charged successfully',
      charge: {
        id: paymentIntent.id,
        amount: penaltyAmount,
        status: paymentIntent.status
      }
    };

  } catch (error) {
    console.error(`❌ Error charging late penalty for order ${orderId}:`, error);
    
    // Handle card declined or payment failure
    if (error.code === 'card_declined' || error.type === 'StripeCardError') {
      // Notify admin for manual collection
      await createAdminNotification(
        'late_penalty_payment_failed',
        `Late penalty payment failed for order ${orderId} - requires manual collection`,
        {
          orderId: orderId,
          data: {
            penaltyAmount: penaltyAmount,
            daysLate: daysLate,
            error: error.message,
            decline_code: error.decline_code
          }
        }
      );
    }

    throw error;
  }
};

/**
 * Webhook handler for Stripe payment events
 * POST /payment/webhook
 */
exports.handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const stripe = await getStripeInstance();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log(`✅ Payment succeeded: ${paymentIntent.id}`);
        // Payment is already confirmed, no action needed
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log(`❌ Payment failed: ${failedPayment.id}`);
        
        // Notify admin of payment failure
        await createAdminNotification(
          'payment_failed',
          `Payment failed: ${failedPayment.id}`,
          {
            data: {
              paymentIntentId: failedPayment.id,
              error: failedPayment.last_payment_error?.message
            }
          }
        );
        break;

      case 'charge.refunded':
        const refund = event.data.object;
        console.log(`♻️ Refund processed: ${refund.id}`);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

module.exports = exports;

