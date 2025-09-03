const Order = require('../models/orders');

/**
 * Settlement Rules Module - Derives settlement amounts from existing Order breakdown
 * Uses existing stored pricing fields without recalculating or changing Stripe logic
 */

/**
 * Calculates seller earnings from a successful rental completion
 * @param {Object} order - Order document with pricing breakdown
 * @returns {Object} Settlement amounts
 */
function calculateSellerEarnings(order) {
  try {
    // Seller gets the rental fee (platform fee goes to platform)
    const sellerEarning = order.rental_fee || 0;
    
    return {
      seller_earning: Math.round(sellerEarning * 100) / 100,
      platform_fee: order.platform_fee || 0,
      breakdown: {
        rental_fee: order.rental_fee || 0,
        platform_fee: order.platform_fee || 0,
        tax_amount: order.tax_amount || 0,
        insurance_amount: order.insurance_amount || 0,
        deposit_amount: order.deposit_amount || 0,
        total_amount: order.total_amount || 0
      }
    };
  } catch (error) {
    console.error('Error calculating seller earnings:', error);
    throw error;
  }
}

/**
 * Calculates penalty amount that reduces seller earnings
 * @param {Object} order - Order document with penalty information
 * @param {number} penaltyAmount - Applied penalty amount
 * @returns {Object} Penalty settlement details
 */
function calculatePenaltySettlement(order, penaltyAmount = null) {
  try {
    const penalty = penaltyAmount || order.penalty_amount || 0;
    const depositAmount = order.deposit_amount || 0;
    
    // Check if penalty exceeds deposit coverage
    let sellerPenalty = 0;
    
    if (penalty > depositAmount) {
      // Penalty exceeds deposit - seller absorbs the difference
      sellerPenalty = penalty - depositAmount;
    }
    // If penalty <= deposit, seller doesn't lose money beyond losing the deposit refund
    
    return {
      penalty_amount: Math.round(penalty * 100) / 100,
      seller_penalty: Math.round(sellerPenalty * 100) / 100,
      deposit_covered: Math.min(penalty, depositAmount),
      breakdown: {
        total_penalty: penalty,
        deposit_coverage: Math.min(penalty, depositAmount),
        seller_responsibility: sellerPenalty
      }
    };
  } catch (error) {
    console.error('Error calculating penalty settlement:', error);
    throw error;
  }
}

/**
 * Calculates refund amounts for different scenarios
 * @param {Object} order - Order document with pricing breakdown
 * @param {string} refundType - Type of refund (full, partial, deposit_only, etc.)
 * @returns {Object} Refund settlement details
 */
function calculateRefundSettlement(order, refundType = 'full') {
  try {
    const totalAmount = order.total_amount || 0;
    const rentalFee = order.rental_fee || 0;
    const depositAmount = order.deposit_amount || 0;
    const insuranceAmount = order.insurance_amount || 0;
    
    let refundAmount = 0;
    let sellerLoss = 0; // Amount seller loses from the refund
    
    switch (refundType) {
      case 'full':
        // Full refund - seller loses rental fee
        refundAmount = totalAmount;
        sellerLoss = rentalFee;
        break;
        
      case 'deposit_only':
        // Only deposit refunded - seller keeps rental fee
        refundAmount = depositAmount;
        sellerLoss = 0;
        break;
        
      case 'insurance_only':
        // Only insurance refunded - seller keeps rental fee
        refundAmount = insuranceAmount;
        sellerLoss = 0;
        break;
        
      case 'partial':
        // Partial refund based on order status and timing
        // This would need specific business rules implementation
        refundAmount = depositAmount + insuranceAmount;
        sellerLoss = 0;
        break;
        
      default:
        refundAmount = 0;
        sellerLoss = 0;
    }
    
    return {
      refund_amount: Math.round(refundAmount * 100) / 100,
      seller_loss: Math.round(sellerLoss * 100) / 100,
      breakdown: {
        total_refund: refundAmount,
        seller_impact: sellerLoss,
        refund_type: refundType
      }
    };
  } catch (error) {
    console.error('Error calculating refund settlement:', error);
    throw error;
  }
}

/**
 * Determines settlement based on order lifecycle and timing
 * @param {Object} order - Order document
 * @param {string} event - Lifecycle event (completed, cancelled, late_return, etc.)
 * @returns {Object} Settlement instructions
 */
function determineSettlement(order, event) {
  try {
    const currentTime = new Date();
    const startDate = new Date(order.rental_schedule.start_date);
    const endDate = new Date(order.rental_schedule.end_date);
    const isBeforeCutoff = currentTime < startDate;
    
    switch (event) {
      case 'completed':
        // Successful completion - seller gets full rental fee
        const earnings = calculateSellerEarnings(order);
        return {
          type: 'completion',
          seller_earning: earnings.seller_earning,
          transactions: [{
            type: 'ORDER_EARNING',
            amount: earnings.seller_earning,
            description: `Rental completed - earnings from order`,
            metadata: { order_breakdown: earnings.breakdown }
          }]
        };
        
      case 'cancelled_before_cutoff':
        // Cancelled before rental start - full refund, no seller earning
        const refund = calculateRefundSettlement(order, 'full');
        return {
          type: 'early_cancellation',
          refund_amount: refund.refund_amount,
          transactions: [{
            type: 'REFUND',
            amount: -refund.seller_loss,
            description: 'Order cancelled - no earnings (early cancellation)',
            metadata: { order_breakdown: refund.breakdown }
          }]
        };
        
      case 'cancelled_after_cutoff':
        // Cancelled after cutoff - seller keeps some earning, partial refund
        const lateEarnings = calculateSellerEarnings(order);
        const partialRefund = calculateRefundSettlement(order, 'partial');
        return {
          type: 'late_cancellation',
          seller_earning: lateEarnings.seller_earning,
          refund_amount: partialRefund.refund_amount,
          transactions: [
            {
              type: 'ORDER_EARNING',
              amount: lateEarnings.seller_earning,
              description: 'Order cancelled after cutoff - partial earnings',
              metadata: { order_breakdown: lateEarnings.breakdown }
            },
            {
              type: 'REFUND',
              amount: -partialRefund.seller_loss,
              description: 'Partial refund for late cancellation',
              metadata: { order_breakdown: partialRefund.breakdown }
            }
          ]
        };
        
      case 'late_return_with_penalty':
        // Late return with penalty
        const earnings = calculateSellerEarnings(order);
        const penalty = calculatePenaltySettlement(order);
        
        const transactions = [{
          type: 'ORDER_EARNING',
          amount: earnings.seller_earning,
          description: 'Rental completed (late) - earnings from order',
          metadata: { order_breakdown: earnings.breakdown }
        }];
        
        // Add penalty transaction if seller is responsible for part of it
        if (penalty.seller_penalty > 0) {
          transactions.push({
            type: 'PENALTY',
            amount: -penalty.seller_penalty,
            description: 'Late return penalty (exceeds deposit)',
            metadata: { penalty_breakdown: penalty.breakdown }
          });
        }
        
        return {
          type: 'late_completion',
          seller_earning: earnings.seller_earning,
          seller_penalty: penalty.seller_penalty,
          transactions
        };
        
      case 'deposit_refund':
        // Deposit refund to renter (separate from main settlement)
        return {
          type: 'deposit_refund',
          refund_amount: order.deposit_amount || 0,
          transactions: [{
            type: 'DEPOSIT_REFUND',
            amount: -(order.deposit_amount || 0),
            description: 'Deposit refunded to renter',
            metadata: { 
              deposit_amount: order.deposit_amount,
              refund_reason: 'Normal deposit return'
            }
          }]
        };
        
      default:
        return {
          type: 'no_settlement',
          transactions: []
        };
    }
  } catch (error) {
    console.error('Error determining settlement:', error);
    throw error;
  }
}

/**
 * Validates if an order is eligible for settlement
 * @param {Object} order - Order document
 * @returns {Object} Validation result
 */
function validateOrderForSettlement(order) {
  try {
    const requiredFields = ['rental_fee', 'platform_fee', 'total_amount'];
    const missingFields = requiredFields.filter(field => !order[field]);
    
    if (missingFields.length > 0) {
      return {
        isValid: false,
        reason: `Missing required pricing fields: ${missingFields.join(', ')}`
      };
    }
    
    if (order.rental_fee <= 0) {
      return {
        isValid: false,
        reason: 'Invalid rental fee amount'
      };
    }
    
    return {
      isValid: true,
      reason: 'Order valid for settlement'
    };
  } catch (error) {
    console.error('Error validating order for settlement:', error);
    return {
      isValid: false,
      reason: 'Error during validation'
    };
  }
}

module.exports = {
  calculateSellerEarnings,
  calculatePenaltySettlement,
  calculateRefundSettlement,
  determineSettlement,
  validateOrderForSettlement
};
