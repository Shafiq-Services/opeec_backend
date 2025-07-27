const AppSettings = require('../models/appSettings');

// GET: Get app settings
exports.getAppSettings = async (req, res) => {
  try {
    // Find the settings document (there should only be one)
    let settings = await AppSettings.findOne();
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = new AppSettings({
        privacy_policy_link: '',
        terms_conditions_link: '',
        stripe_public_key: '',
        stripe_secret_key: ''
      });
      await settings.save();
    }

    res.status(200).json({
      message: 'App settings retrieved successfully',
      status: true,
      settings: {
        privacy_policy_link: settings.privacy_policy_link,
        terms_conditions_link: settings.terms_conditions_link,
        stripe_public_key: settings.stripe_public_key,
        stripe_secret_key: settings.stripe_secret_key,
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

// PUT: Create or update app settings
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

    // Find existing settings or create new one
    let settings = await AppSettings.findOne();
    
    if (settings) {
      // Update existing settings
      settings.privacy_policy_link = privacy_policy_link;
      settings.terms_conditions_link = terms_conditions_link;
      settings.stripe_public_key = stripe_public_key;
      settings.stripe_secret_key = stripe_secret_key;
      await settings.save();
    } else {
      // Create new settings
      settings = new AppSettings({
        privacy_policy_link,
        terms_conditions_link,
        stripe_public_key,
        stripe_secret_key
      });
      await settings.save();
    }

    res.status(200).json({
      message: 'App settings updated successfully',
      status: true,
      settings: {
        privacy_policy_link: settings.privacy_policy_link,
        terms_conditions_link: settings.terms_conditions_link,
        stripe_public_key: settings.stripe_public_key,
        stripe_secret_key: settings.stripe_secret_key,
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