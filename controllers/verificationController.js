const User = require('../models/user');
const AppSettings = require('../models/appSettings');
const { 
  createVerificationSession, 
  retrieveVerificationSession, 
  chargeVerificationFee,
  constructWebhookEvent
} = require('../utils/stripeIdentity');
const { sendEventToUser } = require('../utils/socketService');

/**
 * Initiate Identity Verification
 * POST /user/verification/initiate
 * 
 * This endpoint:
 * 1. Checks if user is already verified
 * 2. Charges $2 verification fee automatically
 * 3. Creates Stripe Identity session
 * 4. Returns session URL for frontend
 */
const initiateVerification = async (req, res) => {
  try {
    const userId = req.userId; // From JWT middleware
    // No body parameters needed - frontend handles payment, backend uses static return_url

    // Note: Frontend handles $2 payment via Stripe bottom sheet
    // Backend only creates verification session with hardcoded return_url

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already verified
    if (user.stripe_verification?.status === 'verified') {
      return res.status(200).json({
        message: 'User is already verified',
        verification_status: 'verified',
        verified_at: user.stripe_verification.verified_at || '',
        already_verified: true
      });
    }

    // Check if verification is pending
    if (user.stripe_verification?.status === 'pending') {
      return res.status(200).json({
        message: 'Verification is already in progress',
        verification_status: 'pending',
        session_id: user.stripe_verification.session_id || '',
        pending: true
      });
    }

    // Get verification settings from AppSettings
    let settings = await AppSettings.findOne();
    if (!settings) {
      // Create default settings if they don't exist
      settings = new AppSettings();
      await settings.save();
    }

    const verificationFee = settings.verification_fee || 2.00;
    const verificationTitle = settings.verification_title || 'Identity Verification Required';
    const verificationDescription = settings.verification_description || 'To ensure a safe and secure rental experience, we need to verify your identity.';

    console.log(`💳 Frontend already handled verification fee: $${verificationFee} for user: ${userId}`);

    // Step 1: Create Stripe Identity verification session (payment handled by frontend)
    // Dynamic return URL - works for both local and production
    const baseUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://opeec.azurewebsites.net';
    const staticReturnUrl = `${baseUrl}/verification-complete`;
    
    console.log(`🔗 Using return URL: ${staticReturnUrl}`);
    
    let session;
    try {
      session = await createVerificationSession(userId, staticReturnUrl);
      console.log(`✅ Verification session created: ${session.id}`);
    } catch (sessionError) {
      console.error('❌ Session creation error:', sessionError);
      
      return res.status(500).json({
        message: 'Failed to create verification session',
        error: sessionError.message,
        error_code: 'session_creation_failed'
      });
    }

    // Step 2: Update user verification status
    if (!user.stripe_verification) {
      user.stripe_verification = {};
    }

    user.stripe_verification.status = 'pending';
    user.stripe_verification.session_id = session.id;
    user.stripe_verification.last_attempt_at = new Date();
    user.stripe_verification.verification_fee_paid = true; // Frontend handled payment
    user.stripe_verification.payment_intent_id = ''; // No backend payment intent

    // Add to attempts array
    if (!user.stripe_verification.attempts) {
      user.stripe_verification.attempts = [];
    }
    
    user.stripe_verification.attempts.push({
      session_id: session.id,
      status: 'pending',
      created_at: new Date()
    });

    await user.save();

    console.log(`✅ User verification initiated: ${userId}`);

    // Return session details to frontend
    res.status(200).json({
      message: 'Verification session created successfully',
      session_url: session.url,
      session_id: session.id,
      client_secret: session.client_secret,
      verification_fee: {
        amount: verificationFee,
        currency: 'usd',
        payment_intent_id: '' // Frontend handled payment
      },
      verification_info: {
        title: verificationTitle,
        description: verificationDescription,
        fee: verificationFee
      }
    });

  } catch (error) {
    console.error('❌ Error initiating verification:', error);
    res.status(500).json({ 
      message: 'Error initiating verification', 
      error: error.message 
    });
  }
};

/**
 * Webhook Handler for Stripe Identity Events
 * POST /user/verification/webhook
 * 
 * Handles:
 * - identity.verification_session.verified
 * - identity.verification_session.requires_input
 * - identity.verification_session.canceled
 */
const handleVerificationWebhook = async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('❌ STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ message: 'Webhook secret not configured' });
    }

    // Construct and verify webhook event
    let event;
    try {
      event = await constructWebhookEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err.message);
      return res.status(400).json({ message: 'Webhook signature verification failed' });
    }

    console.log(`📥 Received webhook event: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'identity.verification_session.verified':
        await handleVerificationVerified(event.data.object);
        break;

      case 'identity.verification_session.requires_input':
        await handleVerificationRequiresInput(event.data.object);
        break;

      case 'identity.verification_session.canceled':
        await handleVerificationCanceled(event.data.object);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true, event_type: event.type });
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    res.status(500).json({ message: 'Webhook processing failed', error: error.message });
  }
};

/**
 * Handle successful verification
 */
async function handleVerificationVerified(session) {
  const userId = session.metadata.userId;
  
  console.log(`✅ Verification successful for user: ${userId}`);
  
  const user = await User.findById(userId);
  if (!user) {
    console.error(`❌ User not found: ${userId}`);
    return;
  }

  // Update verification status
  user.stripe_verification.status = 'verified';
  user.stripe_verification.verified_at = new Date();
  user.stripe_verification.verification_reference = session.id;

  // Update the attempt in the attempts array
  const attemptIndex = user.stripe_verification.attempts.findIndex(
    a => a.session_id === session.id
  );
  
  if (attemptIndex !== -1) {
    user.stripe_verification.attempts[attemptIndex].status = 'verified';
    user.stripe_verification.attempts[attemptIndex].completed_at = new Date();
  }

  // Also update isUserVerified for backward compatibility
  user.isUserVerified = true;
  user.rejection_reason = '';

  await user.save();

  // Send real-time notification to user
  sendEventToUser(userId, 'verificationStatusChanged', {
    status: 'verified',
    message: 'Your identity has been verified successfully! You can now rent equipment.',
    verified_at: new Date()
  });

  console.log(`✅ User verification completed: ${userId}`);
}

/**
 * Handle verification that requires more input
 */
async function handleVerificationRequiresInput(session) {
  const userId = session.metadata.userId;
  
  console.log(`⚠️ Verification requires input for user: ${userId}`);
  
  const user = await User.findById(userId);
  if (!user) {
    console.error(`❌ User not found: ${userId}`);
    return;
  }

  // Keep status as pending but note the issue
  user.stripe_verification.status = 'pending';

  // Update the attempt
  const attemptIndex = user.stripe_verification.attempts.findIndex(
    a => a.session_id === session.id
  );
  
  if (attemptIndex !== -1) {
    user.stripe_verification.attempts[attemptIndex].status = 'requires_input';
    user.stripe_verification.attempts[attemptIndex].failure_reason = 'requires_additional_input';
  }

  await user.save();

  // Send real-time notification
  sendEventToUser(userId, 'verificationStatusChanged', {
    status: 'requires_input',
    message: 'Additional information is required for verification. Please complete the verification process.'
  });
}

/**
 * Handle verification cancelation or failure
 */
async function handleVerificationCanceled(session) {
  const userId = session.metadata.userId;
  
  console.log(`❌ Verification canceled/failed for user: ${userId}`);
  
  const user = await User.findById(userId);
  if (!user) {
    console.error(`❌ User not found: ${userId}`);
    return;
  }

  // Update verification status
  user.stripe_verification.status = 'failed';

  // Update the attempt
  const attemptIndex = user.stripe_verification.attempts.findIndex(
    a => a.session_id === session.id
  );
  
  if (attemptIndex !== -1) {
    user.stripe_verification.attempts[attemptIndex].status = 'failed';
    user.stripe_verification.attempts[attemptIndex].completed_at = new Date();
    user.stripe_verification.attempts[attemptIndex].failure_reason = session.last_error?.reason || 'canceled';
  }

  await user.save();

  // Send real-time notification
  sendEventToUser(userId, 'verificationStatusChanged', {
    status: 'failed',
    message: 'Identity verification failed. Please try again.',
    can_retry: true
  });

  console.log(`❌ User verification failed: ${userId}`);
}

/**
 * Get Verification Status
 * GET /user/verification/status
 * 
 * Returns current verification status from database
 * No need to call Stripe API - webhook keeps it updated
 */
const getVerificationStatus = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).select('stripe_verification');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const verification = user.stripe_verification || {};
    
    // Get verification fee from settings
    const AppSettings = require('../models/appSettings');
    const settings = await AppSettings.findOne();
    const verificationFee = settings?.verification_fee || 2.00;

    res.status(200).json({
      verification_status: verification.status || 'not_verified',
      verified_at: verification.verified_at || '',
      session_id: verification.session_id || '',
      attempts: verification.attempts || [],
      last_attempt_at: verification.last_attempt_at || '',
      fee_paid: verification.verification_fee_paid || false,
      payment_info: {
        amount: verificationFee,
        currency: 'usd',
        payment_intent_id: verification.payment_intent_id || '',
        description: 'Identity Verification Fee'
      }
    });

  } catch (error) {
    console.error('❌ Error getting verification status:', error);
    res.status(500).json({ 
      message: 'Error fetching verification status', 
      error: error.message 
    });
  }
};

module.exports = {
  initiateVerification,
  handleVerificationWebhook,
  getVerificationStatus
};

