const PercentageSetting = require('../models/percentageSettings');

/**
 * @description Get pricing-related percentage settings
 * @route GET /api/percentage-settings
 */
module.exports.getPercentageSettings = async (req, res) => {
  try {
    const settings = await PercentageSetting.findOne().lean();
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Percentage settings not found'
      });
    }

    const {
      adminFeePercentage,
      insurancePercentage,
      depositPercentage,
      taxPercentage,
      dailyInsuranceMultiplier,
      stripeFeePercentage
    } = settings;

    return res.status(200).json({
      success: true,
      message: 'Percentage settings retrieved successfully',
      adminFeePercentage,
      insurancePercentage,
      depositPercentage,
      taxPercentage,
      dailyInsuranceMultiplier,
      stripeFeePercentage
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * @description Update pricing-related percentage settings
 * @route PUT /api/percentage-settings
 */
module.exports.updatePercentageSettings = async (req, res) => {
  try {
    const {
      adminFeePercentage,
      insurancePercentage,
      depositPercentage,
      taxPercentage,
      dailyInsuranceMultiplier,
      stripeFeePercentage
    } = req.body;

    const settings = await PercentageSetting.findOneAndUpdate(
      {},
      {
        adminFeePercentage,
        insurancePercentage,
        depositPercentage,
        taxPercentage,
        dailyInsuranceMultiplier,
        stripeFeePercentage
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    return res.status(200).json({
      success: true,
      message: 'Percentage settings updated successfully',
      adminFeePercentage: settings.adminFeePercentage,
      insurancePercentage: settings.insurancePercentage,
      depositPercentage: settings.depositPercentage,
      taxPercentage: settings.taxPercentage,
      dailyInsuranceMultiplier: settings.dailyInsuranceMultiplier,
      stripeFeePercentage: settings.stripeFeePercentage
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
