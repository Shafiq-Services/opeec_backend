const Stripe = require('stripe');
const StripeKey = require('../models/stripeKey');
const stripeDevDefaults = require('../config/stripeDevDefaults');

/**
 * Get initialized Stripe instance with secret key from database
 * When NODE_ENV=development: always use test key (ignore DB) so test payment intents work
 * Otherwise: use DB key (live mode)
 */
async function getStripeInstance() {
  if (process.env.NODE_ENV === 'development') {
    return Stripe(stripeDevDefaults.STRIPE_SECRET_KEY);
  }
  const stripeKey = await StripeKey.findOne({});
  if (!stripeKey || !stripeKey.secretKey) {
    throw new Error('Stripe secret key not configured in database');
  }
  const key = stripeKey.secretKey;
  if (typeof key === 'string' && key.startsWith('sk_live_')) {
    console.warn('⚠️ Using Stripe LIVE secret key from DB. Payment intents must be created with live keys.');
  }
  return Stripe(key);
}

/**
 * Create a Stripe Identity Verification Session
 * @param {String} userId - User ID for metadata
 * @param {String} returnUrl - URL to redirect after verification
 * @returns {Object} - Verification session object
 */
async function createVerificationSession(userId, returnUrl) {
  try {
    const stripe = await getStripeInstance();
    
    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { 
        userId: userId.toString(),
        source: 'opeec_rental_platform'
      },
      options: {
        document: {
          require_matching_selfie: true,
        }
      },
      return_url: returnUrl || 'https://opeec.azurewebsites.net/verification-complete'
    });

    return session;
  } catch (error) {
    console.error('❌ Error creating Stripe verification session:', error);
    throw new Error(`Failed to create verification session: ${error.message}`);
  }
}

/**
 * Retrieve a Stripe Identity Verification Session
 * @param {String} sessionId - Stripe session ID
 * @returns {Object} - Verification session object
 */
async function retrieveVerificationSession(sessionId) {
  try {
    const stripe = await getStripeInstance();
    const session = await stripe.identity.verificationSessions.retrieve(sessionId);
    return session;
  } catch (error) {
    console.error('❌ Error retrieving verification session:', error);
    throw new Error(`Failed to retrieve verification session: ${error.message}`);
  }
}

/**
 * Charge verification fee using Payment Intent
 * @param {Number} amount - Amount in dollars (will be converted to cents)
 * @param {String} userId - User ID for metadata
 * @param {String} paymentMethodId - Stripe payment method ID
 * @returns {Object} - Payment intent object
 */
async function chargeVerificationFee(amount, userId, paymentMethodId) {
  try {
    const stripe = await getStripeInstance();
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert dollars to cents
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      },
      description: 'Identity Verification Fee - OPEEC',
      metadata: { 
        type: 'verification_fee', 
        userId: userId.toString(),
        source: 'opeec_verification'
      }
    });

    return paymentIntent;
  } catch (error) {
    console.error('❌ Error charging verification fee:', error);
    throw new Error(`Payment failed: ${error.message}`);
  }
}

/**
 * Construct webhook event from request
 * @param {String} payload - Raw request body
 * @param {String} signature - Stripe signature header
 * @param {String} webhookSecret - Webhook secret from env
 * @returns {Object} - Stripe event object
 */
async function constructWebhookEvent(payload, signature, webhookSecret) {
  try {
    const stripe = await getStripeInstance();
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    return event;
  } catch (error) {
    console.error('❌ Error constructing webhook event:', error);
    throw new Error(`Webhook signature verification failed: ${error.message}`);
  }
}

const WEBHOOK_KEY_MAP = {
  payment: 'STRIPE_WEBHOOK_SECRET',
  connect: 'STRIPE_CONNECT_WEBHOOK_SECRET',
  identity: 'STRIPE_IDENTITY_WEBHOOK_SECRET'
};

/**
 * Get webhook secret from database, with env var fallback
 * When NODE_ENV=development: always use test webhooks (ignore DB)
 * Otherwise: DB first, then env var
 * @param {String} type - 'payment', 'connect', or 'identity'
 * @returns {Promise<String>} - Webhook secret
 */
async function getWebhookSecret(type) {
  if (process.env.NODE_ENV === 'development') {
    return stripeDevDefaults[WEBHOOK_KEY_MAP[type]] || '';
  }
  const StripeKey = require('../models/stripeKey');
  const stripeKey = await StripeKey.findOne({});
  switch (type) {
    case 'payment':
      return stripeKey?.webhookSecretPayment || process.env.STRIPE_WEBHOOK_SECRET || '';
    case 'connect':
      return stripeKey?.webhookSecretConnect || process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '';
    case 'identity':
      return stripeKey?.webhookSecretIdentity || process.env.STRIPE_IDENTITY_WEBHOOK_SECRET || process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '';
    default:
      return '';
  }
}

module.exports = {
  getStripeInstance,
  createVerificationSession,
  retrieveVerificationSession,
  chargeVerificationFee,
  constructWebhookEvent,
  getWebhookSecret
};


