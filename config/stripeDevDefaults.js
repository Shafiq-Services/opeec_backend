/**
 * Stripe dev defaults - used ONLY when NODE_ENV=development.
 * Prefer env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, etc.
 * Do not commit real keys; set them in .env or environment.
 */
module.exports = {
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_CONNECT_WEBHOOK_SECRET: process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '',
  STRIPE_IDENTITY_WEBHOOK_SECRET: process.env.STRIPE_IDENTITY_WEBHOOK_SECRET || ''
};
