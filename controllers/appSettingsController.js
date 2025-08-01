const AppSettings = require('../models/appSettings');
const StripeKey = require('../models/stripeKey');

// GET: Get app settings (including stripe keys from separate collection)
exports.getAppSettings = async (req, res) => {
  try {
    // Find the settings document (there should only be one)
    let settings = await AppSettings.findOne();
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = new AppSettings({
        privacy_policy_link: '',
        terms_conditions_link: ''
      });
      await settings.save();
    }

    // Get stripe keys from StripeKey collection
    let stripeKey = await StripeKey.findOne();
    
    // If no stripe keys exist, create default ones
    if (!stripeKey) {
      stripeKey = new StripeKey({
        secretKey: '',
        publishableKey: ''
      });
      await stripeKey.save();
    }

    res.status(200).json({
      message: 'App settings retrieved successfully',
      status: true,
      settings: {
        privacy_policy_link: settings.privacy_policy_link,
        terms_conditions_link: settings.terms_conditions_link,
        stripe_public_key: stripeKey.publishableKey,
        stripe_secret_key: stripeKey.secretKey,
        created_at: settings.createdAt,
        updated_at: settings.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching app settings:', error);
    res.status(500).json({
      message: 'Error fetching app settings',
      status: false,
      error: error.message
    });
  }
};

// PUT: Create or update app settings (including stripe keys in separate collection)
exports.updateAppSettings = async (req, res) => {
  try {
    const {
      privacy_policy_link,
      terms_conditions_link,
      stripe_public_key,
      stripe_secret_key
    } = req.body;

    // Validate required fields
    if (!privacy_policy_link || !terms_conditions_link || !stripe_public_key || !stripe_secret_key) {
      return res.status(400).json({
        message: 'All fields are required: privacy_policy_link, terms_conditions_link, stripe_public_key, stripe_secret_key',
        status: false
      });
    }

    // Validate URL format for links
    const urlRegex = /^https?:\/\/.+/;
    if (!urlRegex.test(privacy_policy_link)) {
      return res.status(400).json({
        message: 'Privacy policy link must be a valid URL starting with http:// or https://',
        status: false
      });
    }

    if (!urlRegex.test(terms_conditions_link)) {
      return res.status(400).json({
        message: 'Terms and conditions link must be a valid URL starting with http:// or https://',
        status: false
      });
    }

    // Validate Stripe keys format (basic validation)
    if (!stripe_public_key.startsWith('pk_')) {
      return res.status(400).json({
        message: 'Stripe public key must start with "pk_"',
        status: false
      });
    }

    if (!stripe_secret_key.startsWith('sk_')) {
      return res.status(400).json({
        message: 'Stripe secret key must start with "sk_"',
        status: false
      });
    }

    // Update or create app settings (privacy policy and terms)
    let settings = await AppSettings.findOne();
    
    if (settings) {
      // Update existing settings
      settings.privacy_policy_link = privacy_policy_link;
      settings.terms_conditions_link = terms_conditions_link;
      await settings.save();
    } else {
      // Create new settings
      settings = new AppSettings({
        privacy_policy_link,
        terms_conditions_link
      });
      await settings.save();
    }

    // Update or create stripe keys in separate collection
    let stripeKey = await StripeKey.findOne();
    
    if (stripeKey) {
      // Update existing stripe keys
      stripeKey.publishableKey = stripe_public_key;
      stripeKey.secretKey = stripe_secret_key;
      await stripeKey.save();
    } else {
      // Create new stripe keys
      stripeKey = new StripeKey({
        publishableKey: stripe_public_key,
        secretKey: stripe_secret_key
      });
      await stripeKey.save();
    }

    res.status(200).json({
      message: 'App settings updated successfully',
      status: true,
      settings: {
        privacy_policy_link: settings.privacy_policy_link,
        terms_conditions_link: settings.terms_conditions_link,
        stripe_public_key: stripeKey.publishableKey,
        stripe_secret_key: stripeKey.secretKey,
        created_at: settings.createdAt,
        updated_at: settings.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating app settings:', error);
    res.status(500).json({
      message: 'Error updating app settings',
      status: false,
      error: error.message
    });
  }
}; 