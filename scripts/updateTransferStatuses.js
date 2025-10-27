/**
 * Update Existing Transfer Statuses for Complete Testing Coverage
 * 
 * Since all available orders now have completed transfers, this script
 * will modify some of them to have different statuses for frontend testing.
 * 
 * Usage: node scripts/updateTransferStatuses.js
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

// Helper function for recent dates
function randomRecentDate(daysAgo = 5) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
  const randomTime = pastDate.getTime() + Math.random() * (now.getTime() - pastDate.getTime());
  return new Date(randomTime);
}

// Update some completed transfers to different statuses
async function updateExistingTransferStatuses() {
  console.log('\n🔄 Updating existing completed transfers to diverse statuses...');
  
  try {
    // Get all orders with completed transfers
    const completedTransfers = await Order.find({
      'stripe_payout.transfer_status': 'completed'
    }).limit(10);
    
    console.log(`📊 Found ${completedTransfers.length} completed transfers to modify`);
    
    if (completedTransfers.length === 0) {
      console.log('ℹ️ No completed transfers found to modify');
      return 0;
    }
    
    // Define what statuses to change them to
    const statusUpdates = [
      { newStatus: 'pending', count: 3 },
      { newStatus: 'processing', count: 2 }, 
      { newStatus: 'failed', count: 2 }
    ];
    
    let orderIndex = 0;
    let updatedCount = 0;
    
    for (const statusUpdate of statusUpdates) {
      console.log(`\n🔄 Converting ${statusUpdate.count} transfers to ${statusUpdate.newStatus} status...`);
      
      for (let i = 0; i < statusUpdate.count && orderIndex < completedTransfers.length; i++) {
        const order = completedTransfers[orderIndex];
        
        let updateData = {
          'stripe_payout.transfer_status': statusUpdate.newStatus,
          'stripe_payout.transfer_triggered_at': randomRecentDate()
        };
        
        // Adjust other fields based on new status
        switch (statusUpdate.newStatus) {
          case 'pending':
            updateData['stripe_payout.transfer_completed_at'] = null;
            updateData['stripe_payout.transfer_failure_reason'] = '';
            break;
            
          case 'processing':
            updateData['stripe_payout.transfer_completed_at'] = null;
            updateData['stripe_payout.transfer_failure_reason'] = '';
            break;
            
          case 'failed':
            updateData['stripe_payout.transfer_completed_at'] = null;
            const failureReasons = [
              'Account temporarily restricted - please contact support',
              'Invalid bank account information',
              'Insufficient funds in platform account'
            ];
            updateData['stripe_payout.transfer_failure_reason'] = failureReasons[i % failureReasons.length];
            break;
        }
        
        await Order.findByIdAndUpdate(order._id, { $set: updateData });
        
        const failureText = updateData['stripe_payout.transfer_failure_reason'] ? 
          ` (${updateData['stripe_payout.transfer_failure_reason']})` : '';
        
        console.log(`✅ Updated transfer ${order._id}: completed → ${statusUpdate.newStatus} - $${order.stripe_payout.transfer_amount}${failureText}`);
        
        orderIndex++;
        updatedCount++;
      }
    }
    
    console.log(`\n✅ Updated ${updatedCount} transfer statuses`);
    return updatedCount;
    
  } catch (error) {
    console.error('❌ Error updating transfer statuses:', error);
    throw error;
  }
}

// Verify the updated data
async function verifyUpdatedData() {
  console.log('\n🔄 Verifying updated transfer data...');
  
  try {
    // Count all transfers by status
    const transferStats = await Order.aggregate([
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
    
    console.log('\n💳 Updated Stripe Transfer Status Summary:');
    let totalTransfers = 0;
    let totalAmount = 0;
    
    transferStats.forEach(stat => {
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
    
    // Specific counts for different scenarios
    const failedCount = await Order.countDocuments({ 'stripe_payout.transfer_status': 'failed' });
    const pendingCount = await Order.countDocuments({ 'stripe_payout.transfer_status': 'pending' });
    const processingCount = await Order.countDocuments({ 'stripe_payout.transfer_status': 'processing' });
    const completedCount = await Order.countDocuments({ 'stripe_payout.transfer_status': 'completed' });
    
    console.log('\n🎯 Testing Scenario Counts:');
    console.log(`   🔴 Failed (for alerts): ${failedCount}`);
    console.log(`   🟡 Pending (time remaining): ${pendingCount}`);
    console.log(`   🔵 Processing (estimated completion): ${processingCount}`);
    console.log(`   🟢 Completed: ${completedCount}`);
    
    // Sample some transfers with failure reasons
    if (failedCount > 0) {
      const failedTransfers = await Order.find({
        'stripe_payout.transfer_status': 'failed'
      }).limit(3);
      
      console.log('\n🚨 Sample Failed Transfer Reasons:');
      failedTransfers.forEach((order, index) => {
        console.log(`   ${index + 1}. ${order._id}: "${order.stripe_payout.transfer_failure_reason}"`);
      });
    }
    
    return { transferStats, totalTransfers, totalAmount, failedCount, pendingCount, processingCount };
    
  } catch (error) {
    console.error('❌ Error verifying updated data:', error);
    throw error;
  }
}

// Main execution
async function main() {
  console.log('🔄 Updating Transfer Statuses for Complete Frontend Testing...');
  console.log('='.repeat(70));
  
  try {
    await connectDB();
    
    const updatedCount = await updateExistingTransferStatuses();
    const verification = await verifyUpdatedData();
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 Transfer Status Updates Completed Successfully!');
    console.log('='.repeat(70));
    console.log(`📊 Final Summary:`);
    console.log(`   • Transfers updated: ${updatedCount}`);
    console.log(`   • Total transfers available: ${verification.totalTransfers}`);
    console.log(`   • Total transfer amount: $${verification.totalAmount.toFixed(2)}`);
    
    console.log('\n✅ Frontend Testing Now Ready:');
    console.log(`   🔴 Failed transfers: ${verification.failedCount} (Dashboard alerts)`);
    console.log(`   🟡 Pending transfers: ${verification.pendingCount} (Time remaining)`);
    console.log(`   🔵 Processing transfers: ${verification.processingCount} (Estimated completion)`);
    console.log(`   🟢 Completed transfers: ${verification.totalTransfers - verification.failedCount - verification.pendingCount - verification.processingCount}`);
    
    console.log('\n🎯 API Testing Scenarios Available:');
    console.log('   • Dashboard Alert: Red failed transfer card will appear');
    console.log('   • Status Filters: All status filters will return data');
    console.log('   • Time Calculations: Pending/processing show remaining time');
    console.log('   • Failure Reasons: Failed transfers show specific error messages');
    console.log('   • Transfer Details: All status types have complete information');
    
    console.log('\n🚀 Frontend developers can now test:');
    console.log('   ✅ Complete dashboard with all card types');
    console.log('   ✅ Finance table with mixed transfer statuses');
    console.log('   ✅ Status filtering and pagination');
    console.log('   ✅ Transfer details modal for each status type');
    console.log('   ✅ Alert systems for failed transfers');
    
  } catch (error) {
    console.error('\n❌ Transfer Status Update Failed:', error);
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
