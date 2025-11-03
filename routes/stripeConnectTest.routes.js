/**
 * Stripe Connect Testing Routes
 * 
 * These routes are for testing Stripe Connect functionality without
 * completing real Stripe onboarding forms.
 */

const express = require('express');
const router = express.Router();
const stripeConnectTestController = require('../controllers/stripeConnectTestController');

/**
 * @route   POST /stripe-connect/test/simulate-account-active
 * @desc    Simulate Stripe webhook to change account from pending to active
 * @access  Public (for testing only)
 * @body    { email: "user@example.com" }
 */
router.post('/simulate-account-active', stripeConnectTestController.simulateAccountActive);

/**
 * @route   POST /stripe-connect/test/simulate-account-disabled
 * @desc    Simulate Stripe webhook to change account to disabled
 * @access  Public (for testing only)
 * @body    { email: "user@example.com" }
 */
router.post('/simulate-account-disabled', stripeConnectTestController.simulateAccountDisabled);

/**
 * @route   POST /stripe-connect/test/reset-to-pending
 * @desc    Reset user's Stripe Connect status to pending for re-testing
 * @access  Public (for testing only)
 * @body    { email: "user@example.com" }
 */
router.post('/reset-to-pending', stripeConnectTestController.resetToPending);

/**
 * @route   GET /stripe-connect/test/users
 * @desc    Get all users with Stripe Connect accounts (for testing)
 * @access  Public (for testing only)
 */
router.get('/users', stripeConnectTestController.getStripeConnectUsers);

module.exports = router;
