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

    res.status(200).json({
      message: 'App settings retrieved successfully',
      status: true,
      settings: {
        privacy_policy_link: settings.privacy_policy_link,
        terms_conditions_link: settings.terms_conditions_link,
        android_store_url: settings.android_store_url,
        ios_store_url: settings.ios_store_url,
        share_message: settings.share_message,
        stripe_public_key: stripeKey.publishableKey,
        stripe_secret_key: stripeKey.secretKey,
        verification_fee: settings.verification_fee || 2.00,
        verification_title: settings.verification_title || 'Identity Verification Required',
        verification_description: settings.verification_description || 'To ensure a safe and secure rental experience, we need to verify your identity.',
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
      verification_fee,
      verification_title,
      verification_description
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
      
      await settings.save();
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
        verification_description: verification_description || 'To ensure a safe and secure rental experience, we need to verify your identity.'
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
        android_store_url: settings.android_store_url,
        ios_store_url: settings.ios_store_url,
        share_message: settings.share_message,
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