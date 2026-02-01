const mongoose = require('mongoose');

// Define the StripeKey schema
const StripeKeySchema = new mongoose.Schema({
    secretKey: {
        type: String,
        required: true,
    },
    publishableKey: {
        type: String,
        required: true,
    },
    // Webhook Secrets - for Stripe signature verification
    // These allow switching between test/live mode from admin panel
    webhookSecretPayment: {
        type: String,
        default: '',
        trim: true
    },
    webhookSecretConnect: {
        type: String,
        default: '',
        trim: true
    },
    webhookSecretIdentity: {
        type: String,
        default: '',
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model('StripeKey', StripeKeySchema);