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
 * Now accepts ALL order details so webhook can create order if Flutter call fails
 */
exports.createPaymentIntent = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      equipment_id,
      total_amount,
      platform_fee,
      rental_fee,
      owner_id,
      // Additional order details for webhook fallback
      start_date,
      end_date,
      address,
      lat,
      lng,
      tax_amount,
      insurance_amount,
      deposit_amount,
      subtotal,
      is_insurance,
      renter_timezone
    } = req.body;

    // Validation - core fields required
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
    // Store ALL order details in metadata so webhook can create order if Flutter call fails
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
        test_mode: isOwnerFullyOnboarded ? 'false' : 'true',
        cross_border: isCrossBorder ? 'true' : 'false',
        connected_account_country: connectedAccountCountry || 'unknown',
        // Order details for webhook fallback (store as strings - Stripe metadata requirement)
        start_date: start_date || '',
        end_date: end_date || '',
        address: address || '',
        lat: lat?.toString() || '',
        lng: lng?.toString() || '',
        tax_amount: tax_amount?.toString() || '0',
        insurance_amount: insurance_amount?.toString() || '0',
        deposit_amount: deposit_amount?.toString() || '0',
        subtotal: subtotal?.toString() || '0',
        total_amount: total_amount.toString(),
        is_insurance: is_insurance ? 'true' : 'false',
        renter_timezone: renter_timezone || ''
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
  
  // Get webhook secret from DB first, with env var fallback
  const { getWebhookSecret } = require('../utils/stripeIdentity');
  const webhookSecret = await getWebhookSecret('payment');

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
        
        // Check if order already exists for this payment
        const existingOrder = await Order.findOne({ 'stripe_payment.payment_intent_id': paymentIntent.id });
        
        if (!existingOrder) {
          // Order doesn't exist - create it from payment intent metadata
          console.log(`⚠️ No order found for payment ${paymentIntent.id}, creating from metadata...`);
          await createOrderFromPaymentIntent(paymentIntent);
        } else {
          console.log(`✅ Order ${existingOrder._id} already exists for payment ${paymentIntent.id}`);
        }
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

/**
 * Create order from payment intent metadata (webhook fallback)
 */
async function createOrderFromPaymentIntent(paymentIntent) {
  const { sendNotificationToUser } = require('./notification');
  const meta = paymentIntent.metadata;
  
  // Validate required metadata
  if (!meta.user_id || !meta.equipment_id || !meta.start_date || !meta.end_date) {
    console.error(`❌ Missing required metadata for order creation. PI: ${paymentIntent.id}`);
    await createAdminNotification(
      'order_creation_failed',
      `Payment ${paymentIntent.id} succeeded but missing metadata for order creation`,
      { data: { payment_intent_id: paymentIntent.id, metadata: meta } }
    );
    return;
  }

  try {
    const equipment = await Equipment.findById(meta.equipment_id);
    if (!equipment) {
      throw new Error(`Equipment ${meta.equipment_id} not found`);
    }

    // Create order with data from payment intent metadata
    const newOrder = new Order({
      userId: meta.user_id,
      equipmentId: meta.equipment_id,
      rental_schedule: { 
        start_date: meta.start_date, 
        end_date: meta.end_date 
      },
      renter_timezone: meta.renter_timezone || 'America/Toronto',
      location: { 
        address: meta.address || '', 
        lat: parseFloat(meta.lat) || 0, 
        lng: parseFloat(meta.lng) || 0 
      },
      rental_fee: parseFloat(meta.rental_fee) || 0,
      platform_fee: parseFloat(meta.platform_fee) || 0,
      tax_amount: parseFloat(meta.tax_amount) || 0,
      insurance_amount: meta.is_insurance === 'true' ? parseFloat(meta.insurance_amount) || 0 : 0,
      deposit_amount: meta.is_insurance === 'true' ? 0 : parseFloat(meta.deposit_amount) || 0,
      subtotal: parseFloat(meta.subtotal) || 0,
      total_amount: parseFloat(meta.total_amount) || (paymentIntent.amount / 100),
      is_insurance: meta.is_insurance === 'true',
      status: 'pending',
      stripe_payment: {
        payment_intent_id: paymentIntent.id,
        payment_method_id: paymentIntent.payment_method,
        customer_id: paymentIntent.customer,
        payment_status: 'succeeded',
        amount_captured: paymentIntent.amount / 100,
        payment_captured_at: new Date()
      }
    });

    await newOrder.save();
    console.log(`✅ Order ${newOrder._id} created from webhook for payment ${paymentIntent.id}`);

    // Send notifications
    try {
      // Notify seller
      await sendNotificationToUser(
        equipment.ownerId.toString(),
        'New Booking!',
        `Your ${equipment.name} has been booked from ${meta.start_date} to ${meta.end_date}.`,
        { orderId: newOrder._id.toString(), type: 'new_booking' }
      );
      
      // Notify buyer
      await sendNotificationToUser(
        meta.user_id,
        'Booking Confirmed!',
        `Your rental of ${equipment.name} is confirmed for ${meta.start_date} to ${meta.end_date}.`,
        { orderId: newOrder._id.toString(), type: 'booking_confirmed' }
      );
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }

    // Admin notification
    await createAdminNotification(
      'order_created_via_webhook',
      `Order ${newOrder._id} created via webhook fallback (Flutter call may have failed)`,
      { data: { orderId: newOrder._id.toString(), payment_intent_id: paymentIntent.id } }
    );

  } catch (error) {
    console.error(`❌ Failed to create order from webhook:`, error);
    await createAdminNotification(
      'order_creation_failed',
      `Failed to create order from payment ${paymentIntent.id}: ${error.message}`,
      { data: { payment_intent_id: paymentIntent.id, error: error.message } }
    );
  }
}

module.exports = exports;

