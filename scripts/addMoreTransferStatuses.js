/**
 * Add More Diverse Transfer Statuses for Complete Frontend Testing
 * 
 * This script adds pending, processing, and failed transfers to complement
 * the completed transfers we already created.
 * 
 * Usage: node scripts/addMoreTransferStatuses.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Order = require('../models/orders');

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
    });
    console.log('✅ MongoDB Connected Successfully');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
}

// More dummy transfer IDs
const additionalTransferIds = [
  'tr_1PQXYz2Ab12Cd51',
  'tr_1PQXYz2Ab12Cd52',
  'tr_1PQXYz2Ab12Cd53',
  'tr_1PQXYz2Ab12Cd54',
  'tr_1PQXYz2Ab12Cd55',
  'tr_1PQXYz2Ab12Cd56',
  'tr_1PQXYz2Ab12Cd57'
];

const dummyStripeAccounts = [
  'acct_1PQXYz2Ab12Cd34',
  'acct_1PQXYz2Ab12Cd35', 
  'acct_1PQXYz2Ab12Cd36',
  'acct_1PQXYz2Ab12Cd37'
];

// Helper functions
function randomRecentDate(daysAgo = 7) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
  const randomTime = pastDate.getTime() + Math.random() * (now.getTime() - pastDate.getTime());
  return new Date(randomTime);
}

function randomAmount() {
  return Math.round((30 + Math.random() * 420) * 100) / 100;
}

// Add diverse transfer statuses
async function addDiverseTransferStatuses() {
  console.log('\n🔄 Adding diverse transfer statuses...');
  
  try {
    // Find orders without Stripe payout data
    const ordersWithoutPayouts = await Order.find({
      'stripe_payout.transfer_id': { $exists: false }
    }).limit(10);
    
    console.log(`📊 Found ${ordersWithoutPayouts.length} orders to add diverse transfer statuses`);
    
    // Define the statuses we want to add
    const statusesToAdd = [
      { status: 'pending', count: 3 },
      { status: 'processing', count: 2 },
      { status: 'failed', count: 2 }
    ];
    
    let orderIndex = 0;
    let transferIdIndex = 0;
    let totalAdded = 0;
    
    for (const statusGroup of statusesToAdd) {
      console.log(`\n🔄 Adding ${statusGroup.count} ${statusGroup.status} transfers...`);
      
      for (let i = 0; i < statusGroup.count && orderIndex < ordersWithoutPayouts.length; i++) {
        const order = ordersWithoutPayouts[orderIndex];
        const transferAmount = randomAmount();
        const triggeredAt = randomRecentDate();
        
        let completedAt = null;
        let failureReason = '';
        
        switch (statusGroup.status) {
          case 'pending':
            // Recently triggered, waiting for Stripe to process
            break;
            
          case 'processing':
            // In progress for 1-2 days
            break;
            
          case 'failed':
            const failureReasons = [
              'Account temporarily restricted - please contact support',
              'Invalid bank account information',
              'Insufficient funds in platform account'
            ];
            failureReason = failureReasons[i % failureReasons.length];
            break;
        }
        
        const stripePayoutData = {
          payment_intent_id: `pi_test_${statusGroup.status}_${Date.now()}_${i}`,
          transfer_id: additionalTransferIds[transferIdIndex % additionalTransferIds.length],
          transfer_status: statusGroup.status,
          transfer_amount: transferAmount,
          transfer_triggered_at: triggeredAt,
          transfer_completed_at: completedAt,
          transfer_failure_reason: failureReason,
          destination_account_id: dummyStripeAccounts[i % dummyStripeAccounts.length]
        };
        
        await Order.findByIdAndUpdate(order._id, {
          $set: { stripe_payout: stripePayoutData }
        });
        
        console.log(`✅ Added ${statusGroup.status} transfer: ${order._id} - $${transferAmount}${failureReason ? ` (${failureReason})` : ''}`);
        
        orderIndex++;
        transferIdIndex++;
        totalAdded++;
      }
    }
    
    console.log(`\n✅ Added ${totalAdded} diverse transfer statuses`);
    return totalAdded;
    
  } catch (error) {
    console.error('❌ Error adding diverse transfer statuses:', error);
    throw error;
  }
}

// Verify the final data
async function verifyFinalData() {
  console.log('\n🔄 Verifying final data...');
  
  try {
    // Count all transfers by status
    const allTransferStats = await Order.aggregate([
      {
        $match: {
          'stripe_payout.transfer_id': { $exists: true, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$stripe_payout.transfer_status',
          count: { $sum: 1 },
          total_amount: { $sum: '$stripe_payout.transfer_amount' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    console.log('\n💳 Final Stripe Transfer Status Summary:');
    let totalTransfers = 0;
    let totalAmount = 0;
    
    allTransferStats.forEach(stat => {
      const statusEmoji = {
        'pending': '🟡',
        'processing': '🔵', 
        'completed': '🟢',
        'failed': '🔴'
      };
      
      console.log(`   ${statusEmoji[stat._id] || '⚪'} ${stat._id}: ${stat.count} transfers - $${stat.total_amount.toFixed(2)}`);
      totalTransfers += stat.count;
      totalAmount += stat.total_amount;
    });
    
    console.log(`   📈 TOTAL: ${totalTransfers} transfers - $${totalAmount.toFixed(2)}`);
    
    // Test failed transfers specifically (for dashboard alert)
    const failedTransfers = await Order.countDocuments({
      'stripe_payout.transfer_status': 'failed'
    });
    
    console.log(`\n🚨 Failed Transfers for Dashboard Alert: ${failedTransfers}`);
    
    return { allTransferStats, totalTransfers, totalAmount, failedTransfers };
    
  } catch (error) {
    console.error('❌ Error verifying final data:', error);
    throw error;
  }
}

// Main execution
async function main() {
  console.log('🔄 Adding Diverse Transfer Statuses for Complete Frontend Testing...');
  console.log('='.repeat(70));
  
  try {
    await connectDB();
    
    const diverseAdded = await addDiverseTransferStatuses();
    const verification = await verifyFinalData();
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 Diverse Transfer Statuses Added Successfully!');
    console.log('='.repeat(70));
    console.log(`📊 Final Summary:`);
    console.log(`   • Diverse transfers added: ${diverseAdded}`);
    console.log(`   • Total transfers now available: ${verification.totalTransfers}`);
    console.log(`   • Total transfer amount: $${verification.totalAmount.toFixed(2)}`);
    console.log(`   • Failed transfers (for alerts): ${verification.failedTransfers}`);
    
    console.log('\n🎯 Frontend Testing Scenarios Now Available:');
    console.log('   ✅ Dashboard Alert: Failed transfers will show red alert');
    console.log('   ✅ Time Remaining: Pending transfers show "X business days"');
    console.log('   ✅ Processing Status: Shows estimated completion dates');
    console.log('   ✅ Failed Status: Shows failure reasons');
    console.log('   ✅ Completed Status: Shows completion dates');
    console.log('   ✅ Status Filtering: All status filters will return data');
    
    console.log('\n🔗 APIs Ready for All Test Cases:');
    console.log('   • GET /admin/dashboard/summary');
    console.log('     → Dashboard will show failed transfer alert if count > 0');
    console.log('   • GET /admin/finance/withdrawals?status=Pending');
    console.log('     → Will return pending transfers with time remaining');
    console.log('   • GET /admin/finance/withdrawals?status=Rejected');
    console.log('     → Will return failed transfers with failure reasons');
    console.log('   • GET /admin/finance/withdrawals?status=Approved');  
    console.log('     → Will return processing transfers');
    console.log('   • GET /admin/finance/withdrawals?status=Paid');
    console.log('     → Will return completed transfers');
    
  } catch (error) {
    console.error('\n❌ Adding Diverse Statuses Failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n📶 MongoDB disconnected');
    process.exit(0);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main };
