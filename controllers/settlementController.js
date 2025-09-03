const Order = require('../models/orders');
const Equipment = require('../models/equipment');
const { createTransaction } = require('../utils/walletService');
const { determineSettlement, validateOrderForSettlement } = require('../utils/settlementRules');

/**
 * Settlement Controller - Handles order lifecycle settlement events
 * This controller is called from existing order lifecycle points to create wallet transactions
 */

/**
 * Process settlement when an order is completed successfully
 * @param {string} orderId - Order ID to settle
 * @returns {Promise<Object>} Settlement result
 */
async function processOrderCompletion(orderId) {
  try {
    console.log(`💰 Processing order completion settlement for order: ${orderId}`);

    // Get order with equipment information to find the seller
    const order = await Order.findById(orderId)
      .populate('equipmentId', 'ownerId title')
      .lean();

    if (!order) {
      throw new Error('Order not found');
    }

    const sellerId = order.equipmentId.ownerId;
    if (!sellerId) {
      throw new Error('Equipment owner not found');
    }

    // Validate order for settlement
    const validation = validateOrderForSettlement(order);
    if (!validation.isValid) {
      console.error(`❌ Order validation failed: ${validation.reason}`);
      return { success: false, reason: validation.reason };
    }

    // Determine settlement amounts
    const settlement = determineSettlement(order, 'completed');
    
    // Create transaction entries
    const transactions = [];
    for (const transactionData of settlement.transactions) {
      const transaction = await createTransaction({
        sellerId,
        type: transactionData.type,
        amount: transactionData.amount,
        description: transactionData.description,
        orderId: order._id,
        metadata: {
          order_breakdown: transactionData.metadata?.order_breakdown || {},
          equipment_title: order.equipmentId.title,
          order_dates: {
            start_date: order.rental_schedule.start_date,
            end_date: order.rental_schedule.end_date
          }
        }
      });
      transactions.push(transaction);
    }

    console.log(`✅ Order completion settlement processed: ${transactions.length} transactions created`);

    return {
      success: true,
      settlement_type: settlement.type,
      seller_earning: settlement.seller_earning || 0,
      transactions: transactions.map(t => ({
        _id: t._id,
        type: t.type,
        amount: t.amount,
        description: t.description
      }))
    };

  } catch (error) {
    console.error('❌ Error processing order completion settlement:', error);
    throw error;
  }
}

/**
 * Process settlement when an order is cancelled
 * @param {string} orderId - Order ID to settle
 * @param {boolean} isBeforeCutoff - Whether cancellation is before rental start
 * @returns {Promise<Object>} Settlement result
 */
async function processOrderCancellation(orderId, isBeforeCutoff = true) {
  try {
    console.log(`🚫 Processing order cancellation settlement for order: ${orderId}, before cutoff: ${isBeforeCutoff}`);

    const order = await Order.findById(orderId)
      .populate('equipmentId', 'ownerId title')
      .lean();

    if (!order) {
      throw new Error('Order not found');
    }

    const sellerId = order.equipmentId.ownerId;
    
    // Validate order for settlement
    const validation = validateOrderForSettlement(order);
    if (!validation.isValid) {
      console.error(`❌ Order validation failed: ${validation.reason}`);
      return { success: false, reason: validation.reason };
    }

    // Determine settlement based on timing
    const eventType = isBeforeCutoff ? 'cancelled_before_cutoff' : 'cancelled_after_cutoff';
    const settlement = determineSettlement(order, eventType);
    
    // Create transaction entries
    const transactions = [];
    for (const transactionData of settlement.transactions) {
      const transaction = await createTransaction({
        sellerId,
        type: transactionData.type,
        amount: transactionData.amount,
        description: transactionData.description,
        orderId: order._id,
        metadata: {
          order_breakdown: transactionData.metadata?.order_breakdown || {},
          equipment_title: order.equipmentId.title,
          cancellation_timing: isBeforeCutoff ? 'before_cutoff' : 'after_cutoff',
          order_dates: {
            start_date: order.rental_schedule.start_date,
            end_date: order.rental_schedule.end_date
          }
        }
      });
      transactions.push(transaction);
    }

    console.log(`✅ Order cancellation settlement processed: ${transactions.length} transactions created`);

    return {
      success: true,
      settlement_type: settlement.type,
      seller_earning: settlement.seller_earning || 0,
      refund_amount: settlement.refund_amount || 0,
      transactions: transactions.map(t => ({
        _id: t._id,
        type: t.type,
        amount: t.amount,
        description: t.description
      }))
    };

  } catch (error) {
    console.error('❌ Error processing order cancellation settlement:', error);
    throw error;
  }
}

/**
 * Process settlement for late return with penalty
 * @param {string} orderId - Order ID to settle
 * @param {number} penaltyAmount - Applied penalty amount
 * @returns {Promise<Object>} Settlement result
 */
async function processLateReturnSettlement(orderId, penaltyAmount = null) {
  try {
    console.log(`⏰ Processing late return settlement for order: ${orderId}, penalty: $${penaltyAmount || 'from order'}`);

    const order = await Order.findById(orderId)
      .populate('equipmentId', 'ownerId title')
      .lean();

    if (!order) {
      throw new Error('Order not found');
    }

    const sellerId = order.equipmentId.ownerId;
    
    // Use provided penalty or order's penalty amount
    const finalPenaltyAmount = penaltyAmount || order.penalty_amount || 0;
    
    // Create a temporary order object with updated penalty for calculation
    const orderWithPenalty = { ...order, penalty_amount: finalPenaltyAmount };
    
    // Validate order for settlement
    const validation = validateOrderForSettlement(orderWithPenalty);
    if (!validation.isValid) {
      console.error(`❌ Order validation failed: ${validation.reason}`);
      return { success: false, reason: validation.reason };
    }

    // Determine settlement with penalty
    const settlement = determineSettlement(orderWithPenalty, 'late_return_with_penalty');
    
    // Create transaction entries
    const transactions = [];
    for (const transactionData of settlement.transactions) {
      const transaction = await createTransaction({
        sellerId,
        type: transactionData.type,
        amount: transactionData.amount,
        description: transactionData.description,
        orderId: order._id,
        metadata: {
          order_breakdown: transactionData.metadata?.order_breakdown || {},
          penalty_breakdown: transactionData.metadata?.penalty_breakdown || {},
          equipment_title: order.equipmentId.title,
          penalty_amount: finalPenaltyAmount,
          order_dates: {
            start_date: order.rental_schedule.start_date,
            end_date: order.rental_schedule.end_date
          }
        }
      });
      transactions.push(transaction);
    }

    console.log(`✅ Late return settlement processed: ${transactions.length} transactions created`);

    return {
      success: true,
      settlement_type: settlement.type,
      seller_earning: settlement.seller_earning || 0,
      seller_penalty: settlement.seller_penalty || 0,
      transactions: transactions.map(t => ({
        _id: t._id,
        type: t.type,
        amount: t.amount,
        description: t.description
      }))
    };

  } catch (error) {
    console.error('❌ Error processing late return settlement:', error);
    throw error;
  }
}

/**
 * Process deposit refund transaction (when deposit is refunded to renter)
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} Settlement result
 */
async function processDepositRefund(orderId) {
  try {
    console.log(`🔄 Processing deposit refund for order: ${orderId}`);

    const order = await Order.findById(orderId)
      .populate('equipmentId', 'ownerId title')
      .lean();

    if (!order) {
      throw new Error('Order not found');
    }

    const sellerId = order.equipmentId.ownerId;
    const depositAmount = order.deposit_amount || 0;
    
    if (depositAmount <= 0) {
      console.log(`ℹ️ No deposit to refund for order: ${orderId}`);
      return { success: true, settlement_type: 'no_deposit', transactions: [] };
    }

    // Create deposit refund transaction
    const transaction = await createTransaction({
      sellerId,
      type: 'DEPOSIT_REFUND',
      amount: -depositAmount,
      description: 'Deposit refunded to renter',
      orderId: order._id,
      metadata: {
        equipment_title: order.equipmentId.title,
        deposit_amount: depositAmount,
        refund_reason: 'Normal deposit return'
      }
    });

    console.log(`✅ Deposit refund processed: $${depositAmount}`);

    return {
      success: true,
      settlement_type: 'deposit_refund',
      refund_amount: depositAmount,
      transactions: [{
        _id: transaction._id,
        type: transaction.type,
        amount: transaction.amount,
        description: transaction.description
      }]
    };

  } catch (error) {
    console.error('❌ Error processing deposit refund:', error);
    throw error;
  }
}

module.exports = {
  processOrderCompletion,
  processOrderCancellation,
  processLateReturnSettlement,
  processDepositRefund
};
