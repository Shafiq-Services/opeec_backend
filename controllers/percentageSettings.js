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
      const { adminFeePercentage, insurancePercentage, taxPercentage, depositePercentage } = settings;
      return res.status(200).json({
        success: true,
        message: 'Percentage settings retrieved successfully',
        adminFeePercentage,
        insurancePercentage,
        depositePercentage,
        taxPercentage
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
      const { adminFeePercentage, insurancePercentage, taxPercentage, depositePercentage } = req.body;
  
      const settings = await PercentageSetting.findOneAndUpdate(
        {},
        { adminFeePercentage, insurancePercentage, taxPercentage, depositePercentage },
        { new: true, upsert: true, runValidators: true }
      ).lean();
  
      return res.status(200).json({
        success: true,
        message: 'Percentage settings updated successfully',
        adminFeePercentage: settings.adminFeePercentage,
        depositePercentage: settings.depositePercentage,
        insurancePercentage: settings.insurancePercentage,
        taxPercentage: settings.taxPercentage
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };