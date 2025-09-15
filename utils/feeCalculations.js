const PercentageSetting = require('../models/percentageSettings');

/**
 * Calculate all fees dynamically based on rental fee and percentage settings
 * @param {Number} rentalFee - Base rental fee
 * @param {Boolean} isInsurance - Whether insurance is selected (true) or deposit (false)
 * @param {Number} rentalDays - Number of rental days for insurance calculation
 * @returns {Object} Calculated fees
 */
async function calculateOrderFees(rentalFee, isInsurance = false, rentalDays = 1) {
  try {
    // Get latest percentage settings
    const settings = await PercentageSetting.findOne().sort({ createdAt: -1 });
    
    if (!settings) {
      throw new Error('Percentage settings not found');
    }

    // Calculate platform fee
    const platformFee = (rentalFee * settings.adminFeePercentage) / 100;
    
    // Calculate tax on rental + platform fee (use rounded platform fee for tax calculation)
    const roundedPlatformFee = Math.round(platformFee * 100) / 100;
    const taxableAmount = rentalFee + roundedPlatformFee;
    const taxAmount = (taxableAmount * settings.taxPercentage) / 100;
    
    // Calculate insurance or deposit
    let insuranceAmount = 0;
    let depositAmount = 0;
    
    if (isInsurance) {
      // Insurance calculation: base percentage + daily multiplier
      const baseInsurance = (rentalFee * settings.insurancePercentage) / 100;
      const dailyMultiplier = rentalDays * settings.dailyInsuranceMultiplier;
      insuranceAmount = baseInsurance * (1 + dailyMultiplier);
    } else {
      // Deposit calculation: percentage of rental fee
      depositAmount = (rentalFee * settings.depositPercentage) / 100;
    }
    
    // Use rounded values for final calculations to ensure consistency
    const roundedRentalFee = Math.round(rentalFee * 100) / 100;
    const roundedTaxAmount = Math.round(taxAmount * 100) / 100;
    const roundedInsuranceAmount = Math.round(insuranceAmount * 100) / 100;
    const roundedDepositAmount = Math.round(depositAmount * 100) / 100;
    
    // Calculate total amount - must include deposit when applicable
    const totalAmount = roundedRentalFee + roundedPlatformFee + roundedTaxAmount + roundedInsuranceAmount + roundedDepositAmount;
    
    // Subtotal should include rental fee + platform fee + insurance/deposit (before tax)
    const subtotal = roundedRentalFee + roundedPlatformFee + roundedInsuranceAmount + roundedDepositAmount;
    
    return {
      rental_fee: Math.round(rentalFee * 100) / 100,
      platform_fee: Math.round(platformFee * 100) / 100,
      tax_amount: Math.round(taxAmount * 100) / 100,
      insurance_amount: Math.round(insuranceAmount * 100) / 100,
      deposit_amount: Math.round(depositAmount * 100) / 100,
      total_amount: Math.round(totalAmount * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100
    };
  } catch (error) {
    console.error('Fee calculation error:', error);
    throw error;
  }
}

/**
 * Get duration details from equipment dropdown reference
 * @param {Object} durationRef - Duration reference object with dropdownId and selectedValue
 * @returns {Object} Duration details with type and count
 */
async function getDurationDetails(durationRef) {
  if (!durationRef || !durationRef.dropdownId) {
    return { type: '', count: 0 };
  }
  
  try {
    const EquipmentDropdown = require('../models/equipmentDropDown');
    const dropdown = await EquipmentDropdown.findById(durationRef.dropdownId);
    
    if (!dropdown) {
      return { type: '', count: 0 };
    }
    
    const selectedOption = dropdown.options.find(opt => opt.value === durationRef.selectedValue);
    
    return {
      type: dropdown.unit.slice(0, -1), // Remove 's' from 'hours' -> 'hour'
      count: durationRef.selectedValue,
      label: selectedOption ? selectedOption.label : `${durationRef.selectedValue} ${dropdown.unit}`
    };
  } catch (error) {
    console.error('Duration details error:', error);
    return { type: '', count: 0 };
  }
}

module.exports = {
  calculateOrderFees,
  getDurationDetails
}; 