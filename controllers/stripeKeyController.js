const StripeKey = require('../models/stripeKey'); // Adjust the path as needed
const Stripe = require('stripe'); // Import Stripe
const stripeDevDefaults = require('../config/stripeDevDefaults');

// When NODE_ENV=development, use test keys so app and backend stay in test mode
async function getStripeKey(req, res) {
    try {
        if (process.env.NODE_ENV === 'development') {
            return res.status(200).json({
                secretKey: stripeDevDefaults.STRIPE_SECRET_KEY,
                publishableKey: stripeDevDefaults.STRIPE_PUBLISHABLE_KEY,
            });
        }
        const stripeKey = await StripeKey.findOne({});
        if (!stripeKey) {
            return res.status(404).json({ message: 'Stripe key not found' });
        }
        return res.status(200).json({ secretKey: stripeKey.secretKey, publishableKey: stripeKey.publishableKey });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

async function updateStripeKey(req, res) {
    const { secretKey, publishableKey } = req.body;

    try {
    
        const stripeKey = await StripeKey.findOneAndUpdate(
            {},
            { secretKey, publishableKey },
            { new: true, upsert: true }
        );

        return res.status(200).json({ message: 'Stripe keys updated successfully', stripeKey });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

async function createPaymentIntent(req, res) {
    const { amount, currency } = req.body;

    try {
        const secretKey = process.env.NODE_ENV === 'development'
            ? stripeDevDefaults.STRIPE_SECRET_KEY
            : (await StripeKey.findOne({}))?.secretKey;
        if (!secretKey) {
            return res.status(404).json({ message: 'Stripe key not found' });
        }

        const stripe = Stripe(secretKey);

        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            payment_method_types: ['card'],
        });

        return res.status(200).json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

module.exports = {
    getStripeKey,
    updateStripeKey,
    createPaymentIntent
};
