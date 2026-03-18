const PercentageSetting = require('../models/percentageSettings');
const EquipmentDropdown = require('../models/equipmentDropDown');

/** Fallback risk rate (%) when admin Insurance % is not set */
const DEFAULT_INSURANCE_RR_PERCENT = 1;

/** Platform fee minimum (CAD) - client spec */
const PLATFORM_FEE_MIN = 0.70;

/**
 * Duration factor for insurance: DF = 1 + min(30%, (rental_days - 3) × 5%).
 * Days ≤ 3 → 1; days > 3 → +5% per extra day, capped at +30%.
 * @param {Number} rentalDays
 * @returns {Number} multiplier (e.g. 1, 1.05, 1.10, ... up to 1.30)
 */
function insuranceDurationFactor(rentalDays) {
  if (rentalDays <= 3) return 1;
  const extraDays = rentalDays - 3;
  const additionalPercent = Math.min(30, extraDays * 5); // cap +30%, +5% per extra day
  return 1 + additionalPercent / 100;
}

/**
 * Calculate all fees dynamically. Insurance and deposit are based on equipment value.
 *
 * Revenue flow:
 * - To Opeec: insurance_amount + platform_fee + tax_amount (retained from payment).
 * - To renter: security deposit is credited back when the rental completes (see orders.js).
 *
 * @param {Number} rentalFee - Base rental fee (daily rate × days)
 * @param {Boolean} isInsurance - Whether insurance is selected (true) or deposit (false)
 * @param {Number} rentalDays - Number of rental days (for insurance duration factor)
 * @param {Number} equipmentValue - Owner-set equipment value (within admin subcategory range)
 * @returns {Object} Calculated fees
 */
async function calculateOrderFees(rentalFee, isInsurance = false, rentalDays = 1, equipmentValue = 0) {
  try {
    // Get latest percentage settings
    const settings = await PercentageSetting.findOne().sort({ createdAt: -1 });
    
    if (!settings) {
      throw new Error('Percentage settings not found');
    }

    // Platform fee: max(rental_fee × platformFeePct, $0.70) - client spec
    const platformFeePct = (settings.adminFeePercentage ?? 3) / 100;
    const potentialPctFee = rentalFee * platformFeePct;
    const platformFee = Math.max(potentialPctFee, PLATFORM_FEE_MIN);

    const roundedPlatformFee = Math.round(platformFee * 100) / 100;

    // Insurance = EV × Risk Rate × Duration Factor. RR = admin "Insurance (%)" from Pricing.
    const ev = Number(equipmentValue) || 0;
    const rrPercent = settings.insurancePercentage != null && !isNaN(settings.insurancePercentage)
      ? Number(settings.insurancePercentage) : DEFAULT_INSURANCE_RR_PERCENT;
    let insuranceAmount = 0;
    let depositAmount = 0;

    if (isInsurance) {
      const df = insuranceDurationFactor(rentalDays);
      insuranceAmount = ev * (rrPercent / 100) * df;
    } else {
      depositAmount = ev * (settings.depositPercentage / 100);
    }

    const roundedInsuranceAmount = Math.round(insuranceAmount * 100) / 100;
    const roundedDepositAmount = Math.round(depositAmount * 100) / 100;

    // Tax ONLY on (platform_fee + insurance) - not on rental; client spec for tax compliance
    const taxableAmount = roundedPlatformFee + roundedInsuranceAmount;
    const taxAmount = (taxableAmount * settings.taxPercentage) / 100;

    // Use rounded values for final calculations to ensure consistency
    const roundedRentalFee = Math.round(rentalFee * 100) / 100;
    const roundedTaxAmount = Math.round(taxAmount * 100) / 100;

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

/**
 * Calculate late fee with platform fee, insurance, tax - client spec.
 * late_base = owner_daily_rate × LATE_MULTIPLIER (1.8%) × days_late
 * platform_fee = max(late_base × 3%, $0.70)
 * insurance = late_base × insuranceRate
 * tax = (platform_fee + insurance) × tax_rate
 * @param {Number} rentalFee - Base rental fee
 * @param {Number} rentalDays - Rental days
 * @param {Number} daysLate - Days late (1, 2, 3...) - use N not N+1 per client
 * @param {Number} equipmentValue - Equipment value for insurance
 * @param {Number} lateFeePct - Optional override (default 1.8)
 * @returns {Object} { late_base, platform_fee, insurance_amount, tax_amount, total_charge }
 */
async function calculateLateFee(rentalFee, rentalDays, daysLate, equipmentValue = 0, lateFeePct = 1.8) {
  const settings = await PercentageSetting.findOne().sort({ createdAt: -1 });
  if (!settings) throw new Error('Percentage settings not found');

  const LATE_MULTIPLIER = lateFeePct / 100; // e.g. 1.8 -> 0.018
  const ownerDailyRate = rentalDays > 0 ? rentalFee / rentalDays : 0;
  const lateBase = Math.round((ownerDailyRate * LATE_MULTIPLIER * daysLate) * 100) / 100;

  const platformFeePct = (settings.adminFeePercentage ?? 3) / 100;
  const potentialPctFee = lateBase * platformFeePct;
  const platformFee = Math.round(Math.max(potentialPctFee, PLATFORM_FEE_MIN) * 100) / 100;

  const rrPercent = settings.insurancePercentage ?? DEFAULT_INSURANCE_RR_PERCENT;
  const insuranceAmount = Math.round((lateBase * (rrPercent / 100)) * 100) / 100;

  const taxableAmount = platformFee + insuranceAmount;
  const taxAmount = Math.round((taxableAmount * (settings.taxPercentage / 100)) * 100) / 100;

  const totalCharge = Math.round((lateBase + platformFee + insuranceAmount + taxAmount) * 100) / 100;

  return {
    late_base: lateBase,
    platform_fee: platformFee,
    insurance_amount: insuranceAmount,
    tax_amount: taxAmount,
    total_charge: totalCharge
  };
}

module.exports = {
  calculateOrderFees,
  calculateLateFee,
  getDurationDetails,
  PLATFORM_FEE_MIN
}; 