/**
 * Stripe Connect Page Routes
 * 
 * These routes handle the redirect URLs from Stripe Connect onboarding
 */

const express = require('express');
const router = express.Router();
const stripeConnectPageController = require('../controllers/stripeConnectPageController');

/**
 * @route   GET /stripe-connect/success
 * @desc    Handle successful Stripe Connect onboarding completion
 * @access  Public (redirect from Stripe)
 */
router.get('/success', stripeConnectPageController.handleOnboardingSuccess);

/**
 * @route   GET /stripe-connect/refresh  
 * @desc    Handle Stripe Connect onboarding refresh/retry
 * @access  Public (redirect from Stripe)
 */
router.get('/refresh', stripeConnectPageController.handleOnboardingRefresh);

module.exports = router;
