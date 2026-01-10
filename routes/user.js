const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const appSettingsController = require('../controllers/appSettingsController');
const verificationController = require('../controllers/verificationController');
const { userMiddleware } = require("../middleWares/user");

// ---------------------- Public Routes ----------------------

// User Signup Route
router.post('/signup', userController.signup);

// User Login Route
router.post('/login', userController.login);

// Send OTP for email verification
router.post('/send_otp', userController.sendOtp);

// Verify user OTP for email verification
router.post('/verify_user_otp', userController.verifyUserOtp);

// Send OTP for password reset
router.post('/forgot_or_reset_password_otp', userController.forgotOrResetPasswordOtp);

// Reset user password
router.post('/reset_password', userController.resetPassword);

// Get public app settings (URLs, share message, etc.)
router.get('/app-settings', appSettingsController.getPublicAppSettings);

// Stripe Identity Verification Webhook (must be public for Stripe to call)
router.post('/verification/webhook', express.raw({ type: 'application/json' }), verificationController.handleVerificationWebhook);

// ---------------------- Protected User Routes ----------------------

// Apply user middleware to user routes
router.use(userMiddleware);

router.get('/profile', userController.getprofile);

// Update user profile
router.put('/update', userController.updateUser);

// Stripe Identity Verification Routes
router.post('/verification/initiate', verificationController.initiateVerification);
router.get('/verification/can-retry', verificationController.canRetryVerification);
router.get('/verification/status', verificationController.getVerificationStatus);
router.get('/verification/history', verificationController.getUserVerificationHistory);
router.get('/verification/recover', verificationController.recoverOrphanedVerification);

// Resend ID card selfie for verification (DEPRECATED - will be removed)
router.put('/resend_id_card_selfie', userController.resendIdCardSelfie);

// Request account reactivation for blocked users
router.post('/request_account_reactivation', userController.requestAccountReactivation);

router.get('/get_fcm', userController.getFCMToken);

// ---------------------- User-to-User Block/Report (Apple App Store Guideline 1.2) ----------------------

// Block another user (content removed from feed instantly)
router.post('/block-user', userController.blockUserByUser);

// Unblock a user
router.post('/unblock-user', userController.unblockUserByUser);

// Get list of blocked users
router.get('/blocked-users', userController.getBlockedUsers);

// Report content or user (mechanism for flagging objectionable content)
router.post('/report', userController.reportContent);

module.exports = router;
