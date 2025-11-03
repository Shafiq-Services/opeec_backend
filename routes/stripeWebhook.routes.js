const express = require('express');
const router = express.Router();
const stripeWebhookController = require('../controllers/stripeWebhookController');

/**
 * Stripe Connect Webhook Route
 * 
 * IMPORTANT: This route must use express.raw() middleware to preserve
 * the raw request body for Stripe signature verification.
 * 
 * This should be registered in index.js BEFORE express.json() middleware:
 * app.use('/webhooks/stripe-connect', express.raw({type: 'application/json'}), stripeWebhookRoutes);
 */

/**
 * @route   POST /webhooks/stripe-connect
 * @desc    Handle Stripe Connect webhook events
 * @access  Public (Stripe signature verified)
 * @events  account.updated, transfer.created, transfer.paid, transfer.failed, payout.paid, payout.failed
 */
router.post('/', stripeWebhookController.handleStripeConnectWebhook);

module.exports = router;

