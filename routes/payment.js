const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { userMiddleware } = require('../middleWares/user');

/**
 * Payment Routes - Stripe payment collection and refund management
 * All routes require authentication except webhook
 */

// Create payment intent before order creation
router.post('/create-intent', userMiddleware, paymentController.createPaymentIntent);

// Confirm payment success (optional validation step)
router.post('/confirm', userMiddleware, paymentController.confirmPayment);

// Webhook for Stripe events (NO authentication - validated by signature)
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.handleWebhook);

module.exports = router;

