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
    }
}, { timestamps: true });

module.exports = mongoose.model('StripeKey', StripeKeySchema);