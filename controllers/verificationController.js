const User = require('../models/user');
const AppSettings = require('../models/appSettings');
const { 
  createVerificationSession, 
  retrieveVerificationSession, 
  chargeVerificationFee,
  constructWebhookEvent
} = require('../utils/stripeIdentity');
const { sendEventToUser } = require('../utils/socketService');
const { createTransaction } = require('../utils/walletService');
const { createAdminNotification } = require('./adminNotificationController');

/**
 * Helper: Send verification status update via socket (both old and new events)
 * Maintains compatibility with existing mobile app
 */
function emitVerificationStatusUpdate(userId, status, message, additionalData = {}) {
  // New event format
  sendEventToUser(userId, 'verificationStatusChanged', {
    status,
    message,
    ...additionalData
  });
  
  // Legacy event format for existing mobile app
  sendEventToUser(userId, 'isVerified', {
    _id: userId,
    isVerified: status === 'verified',
    verification_status: status,
    rejection_reason: status === 'failed' ? message : ''
  });
}

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

    // Check if verification is pending - with smart retry logic
    if (user.stripe_verification?.status === 'pending') {
      const lastAttempt = user.stripe_verification.last_attempt_at;
      const hoursSinceLastAttempt = lastAttempt ? 
        (new Date() - new Date(lastAttempt)) / (1000 * 60 * 60) : 0;
      
      // Allow retry if session is likely expired (>24 hours) or requires input
      if (hoursSinceLastAttempt > 24) {
        console.log(`⏰ Pending session expired (${hoursSinceLastAttempt.toFixed(1)}h ago), allowing retry`);
      } else {
        // Check current session status from Stripe to see if it changed
        try {
          const currentSession = await retrieveVerificationSession(user.stripe_verification.session_id);
          
          if (currentSession.status === 'requires_input') {
            console.log(`⚠️ Session requires input, allowing retry`);
            // Allow retry - fall through to create new session
          } else if (currentSession.status === 'verified') {
            // Update database and return verified status
            user.stripe_verification.status = 'verified';
            user.stripe_verification.verified_at = new Date();
            // Sync isUserVerified with stripe_verification.status
            user.isUserVerified = true;
            user.rejection_reason = '';
            await user.save();
            
            return res.status(200).json({
              message: 'User is already verified',
              verification_status: 'verified',
              verified_at: user.stripe_verification.verified_at,
              already_verified: true
            });
          } else if (currentSession.status === 'canceled' || currentSession.status === 'failed') {
            console.log(`❌ Session ${currentSession.status}, allowing retry`);
            // Allow retry - fall through to create new session
          } else {
            // Still genuinely pending
            return res.status(200).json({
              message: 'Verification is still in progress. Please wait for completion.',
              verification_status: 'pending',
              session_id: user.stripe_verification.session_id,
              hours_since_started: hoursSinceLastAttempt.toFixed(1),
              estimated_completion: '24-48 hours',
              pending: true,
              can_retry_after: lastAttempt ? new Date(new Date(lastAttempt).getTime() + 24 * 60 * 60 * 1000) : null
            });
          }
        } catch (stripeError) {
          console.log(`⚠️ Could not fetch session status, allowing retry: ${stripeError.message}`);
          // If we can't check Stripe status, allow retry (session might be expired)
        }
      }
    }

    // Allow new verification attempt if status is 'failed' or 'not_verified'
    // This will reset status to 'pending' for new verification attempt
    console.log(`🔄 Starting new verification attempt. Previous status: ${user.stripe_verification?.status || 'none'}`);

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
    // Dynamic return URL - works for both local and production (ROOT LEVEL)
    const baseUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'http://localhost:5005';
    const staticReturnUrl = `${baseUrl}/verification-complete`; // ROOT LEVEL - no /user prefix
    
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

    // Step 3: Save to database with error handling and rollback
    try {
      await user.save();
      console.log(`✅ User verification status saved to database: ${userId}`);
    } catch (dbError) {
      console.error('❌ Database save failed after Stripe session creation:', dbError);
      
      // CRITICAL: Rollback - Cancel the Stripe session to prevent orphaned state
      try {
        const stripe = await getStripeInstance();
        await stripe.identity.verificationSessions.cancel(session.id);
        console.log(`🔄 Rolled back Stripe session ${session.id} due to DB save failure`);
      } catch (rollbackError) {
        console.error('❌ Failed to rollback Stripe session:', rollbackError);
        // Log for admin intervention - session is orphaned
        await createAdminNotification({
          type: 'STRIPE_VERIFICATION_ORPHANED',
          message: `⚠️ CRITICAL: Orphaned verification session ${session.id} for user ${userId} - DB save failed`,
          metadata: {
            user_id: userId.toString(),
            session_id: session.id,
            error: dbError.message
          }
        });
      }
      
      return res.status(500).json({
        message: 'Failed to save verification status',
        error: dbError.message,
        error_code: 'database_save_failed',
        session_rolled_back: true
      });
    }
    
    // 💰 LOG VERIFICATION FEE IN WALLET TRANSACTION HISTORY
    try {
      await createTransaction({
        sellerId: userId,
        type: 'VERIFICATION_FEE',
        amount: -verificationFee, // Negative because it's a charge/expense
        description: `Identity Verification Fee - ${verificationTitle}`,
        orderId: null,
        withdrawalRequestId: null,
        metadata: {
          session_id: session.id,
          verification_status: 'pending',
          payment_method: 'stripe_frontend',
          admin_notes: 'Stripe Identity verification fee charged'
        }
      });
      console.log(`💰 Verification fee ($${verificationFee}) logged in wallet for user: ${userId}`);
    } catch (walletError) {
      console.error('⚠️ Failed to log verification fee in wallet (verification still proceeded):', walletError);
      // Don't fail the verification process if wallet logging fails
    }
    
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
    const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('❌ STRIPE_CONNECT_WEBHOOK_SECRET not configured');
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

  // Send real-time notification to user (both events for compatibility)
  emitVerificationStatusUpdate(userId, 'verified', 
    'Your identity has been verified successfully! You can now rent equipment.',
    { verified_at: new Date() }
  );

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

  // Send real-time notification (both events for compatibility)
  emitVerificationStatusUpdate(userId, 'requires_input',
    'Additional information is required for verification. Please complete the verification process.'
  );
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
  // Sync isUserVerified with stripe_verification.status
  user.isUserVerified = false;
  user.rejection_reason = session.last_error?.reason || 'Identity verification failed';

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

  // Send real-time notification (both events for compatibility)
  emitVerificationStatusUpdate(userId, 'failed',
    'Identity verification failed. Please try again.',
    { can_retry: true }
  );

  console.log(`❌ User verification failed: ${userId}`);
}

/**
 * Sync verification statuses with Stripe (Background Job - Admin only)
 * GET /admin/users/sync-verification-statuses
 * 
 * Checks all pending verifications and updates database with current Stripe status
 * Prevents stale "pending" statuses
 */
const syncVerificationStatuses = async (req, res) => {
  try {
    console.log('🔄 Starting verification status sync...');
    
    const User = require('../models/user');
    
    // Find all users with pending verification older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const pendingUsers = await User.find({
      'stripe_verification.status': 'pending',
      'stripe_verification.last_attempt_at': { $lt: oneHourAgo }
    }).select('_id stripe_verification');

    const results = {
      checked: 0,
      updated: 0,
      failed: 0,
      details: []
    };

    for (const user of pendingUsers) {
      results.checked++;
      
      try {
        const sessionId = user.stripe_verification.session_id;
        if (!sessionId) {
          results.failed++;
          continue;
        }

        // Check current status from Stripe
        const currentSession = await retrieveVerificationSession(sessionId);
        const currentStatus = currentSession.status;
        const dbStatus = user.stripe_verification.status;

        // Update if status changed
        if (currentStatus !== dbStatus) {
          user.stripe_verification.status = currentStatus;
          
          if (currentStatus === 'verified') {
            user.stripe_verification.verified_at = new Date();
            user.isUserVerified = true;
          }
          
          // ✅ FIX: Also update the attempt in the attempts array
          const attemptIndex = user.stripe_verification.attempts.findIndex(
            a => a.session_id === sessionId
          );
          
          if (attemptIndex !== -1) {
            user.stripe_verification.attempts[attemptIndex].status = currentStatus;
            user.stripe_verification.attempts[attemptIndex].completed_at = new Date();
            
            if (currentStatus === 'failed' || currentStatus === 'canceled') {
              user.stripe_verification.attempts[attemptIndex].failure_reason = 
                currentSession.last_error?.reason || 'canceled';
            }
          }
          
          await user.save();
          results.updated++;
          
          // Send socket notification
          emitVerificationStatusUpdate(user._id.toString(), currentStatus,
            `Verification status updated to: ${currentStatus}`
          );
          
          results.details.push({
            user_id: user._id,
            old_status: dbStatus,
            new_status: currentStatus
          });
          
          console.log(`✅ Synced user ${user._id}: ${dbStatus} → ${currentStatus}`);
        }
      } catch (error) {
        results.failed++;
        console.error(`❌ Failed to sync user ${user._id}:`, error.message);
      }
    }

    console.log(`✅ Sync complete: ${results.updated}/${results.checked} updated, ${results.failed} failed`);

    res.status(200).json({
      message: 'Verification status sync completed',
      checked: results.checked,
      updated: results.updated,
      failed: results.failed,
      details: results.details
    });

  } catch (error) {
    console.error('❌ Error syncing verification statuses:', error);
    res.status(500).json({
      message: 'Error syncing verification statuses',
      error: error.message
    });
  }
};

/**
 * Check if verification retry is allowed
 * GET /user/verification/can-retry
 * 
 * Returns whether user can retry verification and why/when
 */
const canRetryVerification = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId).select('stripe_verification');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const verification = user.stripe_verification || {};
    const status = verification.status || 'not_verified';
    
    // Already verified - no retry needed
    if (status === 'verified') {
      return res.status(200).json({
        can_retry: false,
        reason: 'already_verified',
        message: 'User is already verified',
        verification_status: 'verified'
      });
    }

    // Not verified - user hasn't started yet, show "Verify Now" not "Retry"
    if (status === 'not_verified') {
      return res.status(200).json({
        can_retry: false,
        reason: 'not_started',
        message: 'Verification not started yet',
        verification_status: status
      });
    }

    // Failed - can retry
    if (status === 'failed') {
      return res.status(200).json({
        can_retry: true,
        reason: 'failed',
        message: 'Retry allowed',
        verification_status: status
      });
    }

    // Requires input - can retry
    if (status === 'requires_input') {
      return res.status(200).json({
        can_retry: true,
        reason: 'requires_input',
        message: 'Additional information needed, retry allowed',
        verification_status: status
      });
    }

    // Pending - check smart retry conditions
    if (status === 'pending') {
      const lastAttempt = verification.last_attempt_at;
      const hoursSinceLastAttempt = lastAttempt ? 
        (new Date() - new Date(lastAttempt)) / (1000 * 60 * 60) : 0;
      
      // Session likely expired
      if (hoursSinceLastAttempt > 24) {
        return res.status(200).json({
          can_retry: true,
          reason: 'session_expired',
          message: 'Session expired, retry allowed',
          hours_since_started: hoursSinceLastAttempt.toFixed(1),
          verification_status: status
        });
      }

      // Check Stripe session status
      try {
        const currentSession = await retrieveVerificationSession(verification.session_id);
        
        if (currentSession.status === 'requires_input') {
          return res.status(200).json({
            can_retry: true,
            reason: 'requires_input',
            message: 'Additional documents needed, retry allowed',
            verification_status: status
          });
        }
        
        if (currentSession.status === 'verified') {
          return res.status(200).json({
            can_retry: false,
            reason: 'verified',
            message: 'Verification completed successfully',
            verification_status: 'verified'
          });
        }
        
        if (currentSession.status === 'canceled' || currentSession.status === 'failed') {
          return res.status(200).json({
            can_retry: true,
            reason: 'session_failed',
            message: 'Previous session failed, retry allowed',
            verification_status: 'failed'
          });
        }
        
        // Still genuinely pending
        const retryAfter = lastAttempt ? new Date(new Date(lastAttempt).getTime() + 24 * 60 * 60 * 1000) : null;
        return res.status(200).json({
          can_retry: false,
          reason: 'still_pending',
          message: 'Verification is still being processed',
          hours_since_started: hoursSinceLastAttempt.toFixed(1),
          estimated_completion: '24-48 hours',
          can_retry_after: retryAfter,
          verification_status: status
        });
        
      } catch (stripeError) {
        // If can't check Stripe, assume retry is allowed
        return res.status(200).json({
          can_retry: true,
          reason: 'stripe_check_failed',
          message: 'Session status unclear, retry allowed',
          verification_status: status
        });
      }
    }

    // Default case
    return res.status(200).json({
      can_retry: false,
      reason: 'unknown_status',
      message: 'Cannot determine retry eligibility',
      verification_status: status
    });

  } catch (error) {
    console.error('❌ Error checking retry eligibility:', error);
    res.status(500).json({
      message: 'Error checking retry eligibility',
      error: error.message
    });
  }
};

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

/**
 * Get User Verification History Timeline
 * GET /user/verification/history
 * 
 * Returns complete verification history for the authenticated user
 * Includes all attempts, statuses, timestamps in timeline format
 */
const getUserVerificationHistory = async (req, res) => {
  try {
    const userId = req.userId;
    
    console.log(`📋 Getting verification history for user: ${userId}`);
    
    const user = await User.findById(userId).select('stripe_verification isUserVerified rejection_reason');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const verification = user.stripe_verification || {};
    const verificationAttempts = verification.attempts || [];
    
    // Get app settings for fee info
    const settings = await AppSettings.findOne().select('verification_fee verification_title verification_description');
    const verificationFee = settings?.verification_fee || 2.00;
    
    // Format attempts for timeline display (simplified)
    const attempts = verificationAttempts.map((attempt, index) => ({
      attempt_number: index + 1,
      session_id: attempt.session_id || '',
      status: attempt.status || 'pending',
      started_at: attempt.started_at || attempt.created_at || ''
    }));

    // Sort attempts by most recent first
    attempts.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));

    // Current status info
    const currentStatus = verification.status || 'not_verified';
    
    // Status messages for UI
    const statusMessages = {
      'not_verified': 'Identity verification not started',
      'pending': 'Verification in progress - please wait for review',
      'verified': 'Identity successfully verified',
      'failed': 'Verification failed - please try again',
      'requires_input': 'Additional information required'
    };

    const response = {
      current_status: currentStatus,
      current_status_message: statusMessages[currentStatus] || 'Unknown status',
      // Only show retry button for failed or requires_input status
      // Hide for pending (still processing) and not_verified (hasn't started yet)
      can_retry: ['failed', 'requires_input'].includes(currentStatus),
      next_steps: getNextStepsMessage(currentStatus),
      attempts
    };

    console.log(`✅ Verification history retrieved for user ${userId}: ${attempts.length} attempts`);
    
    res.status(200).json(response);

  } catch (error) {
    console.error('❌ Error getting verification history:', error);
    res.status(500).json({ 
      message: 'Error retrieving verification history', 
      error: error.message 
    });
  }
};

/**
 * Get next steps message based on current status
 */
function getNextStepsMessage(status) {
  const nextSteps = {
    'not_verified': 'Start your identity verification to rent equipment',
    'pending': 'Your verification is being reviewed. You\'ll receive a notification once complete.',
    'verified': 'You\'re all set! You can now rent equipment and access all features.',
    'failed': 'Please retry verification with clearer documents or contact support for help.',
    'requires_input': 'Please complete the verification process with additional information.'
  };
  
  return nextSteps[status] || 'Check your verification status in the app.';
}

/**
 * Recovery endpoint: Sync orphaned Stripe verification sessions
 * GET /user/verification/recover
 * 
 * Checks if user has Stripe sessions that aren't in database and syncs them
 * Prevents dead-end states from database save failures
 */
const recoverOrphanedVerification = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If user has no session_id but might have orphaned sessions, check Stripe
    if (!user.stripe_verification?.session_id) {
      // No session to recover
      return res.status(200).json({
        message: 'No orphaned sessions found',
        recovered: false
      });
    }

    const sessionId = user.stripe_verification.session_id;
    
    try {
      // Check current status from Stripe
      const currentSession = await retrieveVerificationSession(sessionId);
      const currentStatus = currentSession.status;
      const dbStatus = user.stripe_verification.status;

      // If statuses don't match, update database
      if (currentStatus !== dbStatus) {
        user.stripe_verification.status = currentStatus;
        
        if (currentStatus === 'verified') {
          user.stripe_verification.verified_at = new Date();
          user.isUserVerified = true;
        }
        
        // ✅ FIX: Also update the attempt in the attempts array
        const attemptIndex = user.stripe_verification.attempts.findIndex(
          a => a.session_id === sessionId
        );
        
        if (attemptIndex !== -1) {
          user.stripe_verification.attempts[attemptIndex].status = currentStatus;
          user.stripe_verification.attempts[attemptIndex].completed_at = new Date();
          
          // Add failure reason if failed
          if (currentStatus === 'failed' || currentStatus === 'canceled') {
            user.stripe_verification.attempts[attemptIndex].failure_reason = 
              currentSession.last_error?.reason || 'canceled';
          }
        }
        
        await user.save();
        
        // Send socket notification
        emitVerificationStatusUpdate(userId, currentStatus,
          `Verification status recovered: ${currentStatus}`
        );
        
        return res.status(200).json({
          message: 'Verification status recovered',
          recovered: true,
          old_status: dbStatus,
          new_status: currentStatus
        });
      }
      
      return res.status(200).json({
        message: 'Status already in sync',
        recovered: false,
        status: dbStatus
      });
      
    } catch (stripeError) {
      // Session might not exist in Stripe (expired/deleted)
      if (stripeError.message.includes('No such')) {
        // Reset to not_verified if session doesn't exist
        user.stripe_verification.status = 'not_verified';
        user.stripe_verification.session_id = '';
        // Sync isUserVerified with stripe_verification.status
        user.isUserVerified = false;
        user.rejection_reason = 'Verification session expired - please verify again';
        await user.save();
        
        return res.status(200).json({
          message: 'Orphaned session cleaned up',
          recovered: true,
          action: 'reset_to_not_verified'
        });
      }
      
      throw stripeError;
    }

  } catch (error) {
    console.error('❌ Error recovering verification:', error);
    res.status(500).json({
      message: 'Error recovering verification',
      error: error.message
    });
  }
};

module.exports = {
  initiateVerification,
  canRetryVerification,
  syncVerificationStatuses,
  handleVerificationWebhook,
  getVerificationStatus,
  getUserVerificationHistory,
  recoverOrphanedVerification
};

