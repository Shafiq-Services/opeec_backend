const express = require('express');
const router = express.Router();
const stripeConnectController = require('../controllers/stripeConnectController');
const { userMiddleware } = require('../middleWares/user');

// Debug: Check if functions are properly imported
console.log('Stripe Connect Controller functions:', Object.keys(stripeConnectController));

/**
 * Stripe Connect Routes - Equipment owner payout onboarding
 * All routes require user authentication
 */

/**
 * @route   POST /stripe-connect/create-account
 * @desc    Create Stripe Connect Express account for equipment owner
 * @access  Protected (User)
 * @body    { country: "US" } - Optional, defaults to US
 */
router.post('/create-account', userMiddleware, stripeConnectController.createConnectAccount);

/**
 * @route   GET /stripe-connect/account-status
 * @desc    Get current Stripe Connect account status
 * @access  Protected (User)
 * @returns Account status, onboarding completion, requirements
 */
router.get('/account-status', userMiddleware, stripeConnectController.getAccountStatus);

/**
 * @route   POST /stripe-connect/refresh-onboarding
 * @desc    Refresh onboarding link if expired
 * @access  Protected (User)
 * @returns New onboarding URL
 */
router.post('/refresh-onboarding', userMiddleware, stripeConnectController.refreshOnboardingLink);

/**
 * @route   GET /stripe-connect/payout-history
 * @desc    Get user's Stripe payout history
 * @access  Protected (User)
 * @query   { limit: 20 } - Optional, defaults to 20
 */
router.get('/payout-history', userMiddleware, stripeConnectController.getPayoutHistory);

module.exports = router;

