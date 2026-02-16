const AppSettings = require('../models/appSettings');
const StripeKey = require('../models/stripeKey');
const stripeDevDefaults = require('../config/stripeDevDefaults');

// GET: Get app settings (including stripe keys from separate collection)
exports.getAppSettings = async (req, res) => {
  try {
    // Find the settings document (there should only be one)
    let settings = await AppSettings.findOne();
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = new AppSettings({
        privacy_policy_link: '',
        terms_conditions_link: 'https://advyro.com/terms-and-conditions',
        android_store_url: 'https://play.google.com/store/apps/details?id=com.example.opeec',
        ios_store_url: 'https://apps.apple.com/app/id123456789',
        share_message: '🎉 Check out OPEEC - The ultimate equipment rental app!\\n\\n📱 Download now: {store_url}\\n\\n#OPEEC #EquipmentRental #RentAnything'
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

    // When NODE_ENV=development: always return test Stripe keys (ignore DB)
    // Otherwise: use DB values
    const isDev = process.env.NODE_ENV === 'development';
    const stripePk = isDev ? stripeDevDefaults.STRIPE_PUBLISHABLE_KEY : stripeKey.publishableKey;
    const stripeSk = isDev ? stripeDevDefaults.STRIPE_SECRET_KEY : stripeKey.secretKey;
    const whPayment = isDev ? stripeDevDefaults.STRIPE_WEBHOOK_SECRET : (stripeKey.webhookSecretPayment || '');
    const whConnect = isDev ? stripeDevDefaults.STRIPE_CONNECT_WEBHOOK_SECRET : (stripeKey.webhookSecretConnect || '');
    const whIdentity = isDev ? stripeDevDefaults.STRIPE_IDENTITY_WEBHOOK_SECRET : (stripeKey.webhookSecretIdentity || '');

    res.status(200).json({
      message: 'App settings retrieved successfully',
      status: true,
      settings: {
        privacy_policy_link: settings.privacy_policy_link,
        terms_conditions_link: settings.terms_conditions_link,
        android_store_url: settings.android_store_url,
        ios_store_url: settings.ios_store_url,
        share_message: settings.share_message,
        stripe_public_key: stripePk || '',
        stripe_secret_key: stripeSk || '',
        // Webhook secrets for test/live mode switching
        stripe_webhook_secret_payment: whPayment,
        stripe_webhook_secret_connect: whConnect,
        stripe_webhook_secret_identity: whIdentity,
        verification_fee: settings.verification_fee || 2.00,
        verification_title: settings.verification_title || 'Identity Verification Required',
        verification_description: settings.verification_description || 'To ensure a safe and secure rental experience, we need to verify your identity.',
        stripe_connect_title: settings.stripe_connect_title || 'Connect Your Bank Account',
        stripe_connect_description: settings.stripe_connect_description || 'Connect your bank account to receive automatic payouts after each rental.',
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
      android_store_url,
      ios_store_url,
      share_message,
      stripe_public_key,
      stripe_secret_key,
      // Webhook secrets for test/live mode switching
      stripe_webhook_secret_payment,
      stripe_webhook_secret_connect,
      stripe_webhook_secret_identity,
      verification_fee,
      verification_title,
      verification_description,
      stripe_connect_title,
      stripe_connect_description
    } = req.body;

    // Validate required fields
    if (!privacy_policy_link || !terms_conditions_link || !android_store_url || !ios_store_url || !share_message || !stripe_public_key || !stripe_secret_key) {
      return res.status(400).json({
        message: 'All fields are required: privacy_policy_link, terms_conditions_link, android_store_url, ios_store_url, share_message, stripe_public_key, stripe_secret_key',
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

    if (!urlRegex.test(android_store_url)) {
      return res.status(400).json({
        message: 'Android store URL must be a valid URL starting with http:// or https://',
        status: false
      });
    }

    if (!urlRegex.test(ios_store_url)) {
      return res.status(400).json({
        message: 'iOS store URL must be a valid URL starting with http:// or https://',
        status: false
      });
    }

    // Validate share message contains placeholder
    if (!share_message.includes('{store_url}')) {
      return res.status(400).json({
        message: 'Share message must contain {store_url} placeholder for dynamic URL insertion',
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

    // Validate webhook secrets format (optional fields - only validate if provided)
    if (stripe_webhook_secret_payment && stripe_webhook_secret_payment.trim() !== '' && !stripe_webhook_secret_payment.startsWith('whsec_')) {
      return res.status(400).json({
        message: 'Payment webhook secret must start with "whsec_"',
        status: false
      });
    }
    if (stripe_webhook_secret_connect && stripe_webhook_secret_connect.trim() !== '' && !stripe_webhook_secret_connect.startsWith('whsec_')) {
      return res.status(400).json({
        message: 'Connect webhook secret must start with "whsec_"',
        status: false
      });
    }
    if (stripe_webhook_secret_identity && stripe_webhook_secret_identity.trim() !== '' && !stripe_webhook_secret_identity.startsWith('whsec_')) {
      return res.status(400).json({
        message: 'Identity webhook secret must start with "whsec_"',
        status: false
      });
    }

    // Update or create app settings (privacy policy and terms)
    let settings = await AppSettings.findOne();
    
    if (settings) {
      // Update existing settings
      settings.privacy_policy_link = privacy_policy_link;
      settings.terms_conditions_link = terms_conditions_link;
      settings.android_store_url = android_store_url;
      settings.ios_store_url = ios_store_url;
      settings.share_message = share_message;
      
      // Update verification settings if provided
      if (verification_fee !== undefined) settings.verification_fee = verification_fee;
      if (verification_title !== undefined) settings.verification_title = verification_title;
      if (verification_description !== undefined) settings.verification_description = verification_description;
      
      // Update Stripe Connect settings if provided
      if (stripe_connect_title !== undefined) settings.stripe_connect_title = stripe_connect_title;
      if (stripe_connect_description !== undefined) settings.stripe_connect_description = stripe_connect_description;
      
      await settings.save();
      // Reload to get fresh updatedAt timestamp from MongoDB
      settings = await AppSettings.findById(settings._id);
    } else {
      // Create new settings
      settings = new AppSettings({
        privacy_policy_link,
        terms_conditions_link,
        android_store_url,
        ios_store_url,
        share_message,
        verification_fee: verification_fee || 2.00,
        verification_title: verification_title || 'Identity Verification Required',
        verification_description: verification_description || 'To ensure a safe and secure rental experience, we need to verify your identity.',
        stripe_connect_title: stripe_connect_title || 'Connect Your Bank Account',
        stripe_connect_description: stripe_connect_description || 'Connect your bank account to receive automatic payouts after each rental.'
      });
      await settings.save();
      // Reload to get fresh updatedAt timestamp from MongoDB
      settings = await AppSettings.findById(settings._id);
    }

    // Update or create stripe keys in separate collection
    let stripeKey = await StripeKey.findOne();
    
    if (stripeKey) {
      // Update existing stripe keys
      stripeKey.publishableKey = stripe_public_key;
      stripeKey.secretKey = stripe_secret_key;
      // Update webhook secrets if provided
      if (stripe_webhook_secret_payment !== undefined) stripeKey.webhookSecretPayment = stripe_webhook_secret_payment;
      if (stripe_webhook_secret_connect !== undefined) stripeKey.webhookSecretConnect = stripe_webhook_secret_connect;
      if (stripe_webhook_secret_identity !== undefined) stripeKey.webhookSecretIdentity = stripe_webhook_secret_identity;
      await stripeKey.save();
    } else {
      // Create new stripe keys
      stripeKey = new StripeKey({
        publishableKey: stripe_public_key,
        secretKey: stripe_secret_key,
        webhookSecretPayment: stripe_webhook_secret_payment || '',
        webhookSecretConnect: stripe_webhook_secret_connect || '',
        webhookSecretIdentity: stripe_webhook_secret_identity || ''
      });
      await stripeKey.save();
    }

    res.status(200).json({
      message: 'App settings updated successfully',
      status: true,
      settings: {
        privacy_policy_link: settings.privacy_policy_link,
        terms_conditions_link: settings.terms_conditions_link,
        android_store_url: settings.android_store_url,
        ios_store_url: settings.ios_store_url,
        share_message: settings.share_message,
        stripe_public_key: stripeKey.publishableKey,
        stripe_secret_key: stripeKey.secretKey,
        stripe_webhook_secret_payment: stripeKey.webhookSecretPayment || '',
        stripe_webhook_secret_connect: stripeKey.webhookSecretConnect || '',
        stripe_webhook_secret_identity: stripeKey.webhookSecretIdentity || '',
        verification_fee: settings.verification_fee,
        verification_title: settings.verification_title,
        verification_description: settings.verification_description,
        stripe_connect_title: settings.stripe_connect_title,
        stripe_connect_description: settings.stripe_connect_description,
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

// GET: Get public app settings (for users - excludes sensitive Stripe keys)
exports.getPublicAppSettings = async (req, res) => {
  try {
    // Find the settings document (there should only be one)
    let settings = await AppSettings.findOne();
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = new AppSettings({
        privacy_policy_link: '',
        terms_conditions_link: 'https://advyro.com/terms-and-conditions',
        android_store_url: 'https://play.google.com/store/apps/details?id=com.example.opeec',
        ios_store_url: 'https://apps.apple.com/app/id123456789',
        share_message: '🎉 Check out OPEEC - The ultimate equipment rental app!\\n\\n📱 Download now: {store_url}\\n\\n#OPEEC #EquipmentRental #RentAnything'
      });
      await settings.save();
    }

    res.status(200).json({
      message: 'App settings retrieved successfully',
      status: true,
      settings: {
        privacy_policy_link: settings.privacy_policy_link,
        terms_conditions_link: settings.terms_conditions_link,
        android_store_url: settings.android_store_url,
        ios_store_url: settings.ios_store_url,
        share_message: settings.share_message,
        verification_info: {
          fee: settings.verification_fee || 2.00,
          title: settings.verification_title || 'Identity Verification Required',
          description: settings.verification_description || 'To ensure a safe and secure rental experience, we need to verify your identity.'
        },
        stripe_connect_info: {
          title: settings.stripe_connect_title || 'Connect Your Bank Account',
          description: settings.stripe_connect_description || 'Connect your bank account to receive automatic payouts after each rental.'
        },
        created_at: settings.createdAt,
        updated_at: settings.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching public app settings:', error);
    res.status(500).json({
      message: 'Error fetching app settings',
      status: false,
      error: error.message
    });
  }
}; 