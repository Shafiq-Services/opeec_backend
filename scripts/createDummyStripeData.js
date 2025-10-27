/**
 * Force Create Dummy Stripe Data for Frontend Testing
 * 
 * This script will:
 * 1. Update some existing users with active Stripe Connect accounts
 * 2. Create dummy Stripe payout data for existing orders
 * 3. Ensure we have data for all transfer statuses for testing
 * 
 * Usage: node scripts/createDummyStripeData.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('../models/user');
const Order = require('../models/orders');
const Equipment = require('../models/equipment');

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

// Dummy data arrays
const dummyStripeAccounts = [
  'acct_1PQXYz2Ab12Cd34',
  'acct_1PQXYz2Ab12Cd35', 
  'acct_1PQXYz2Ab12Cd36',
  'acct_1PQXYz2Ab12Cd37',
  'acct_1PQXYz2Ab12Cd38',
  'acct_1PQXYz2Ab12Cd39',
  'acct_1PQXYz2Ab12Cd40',
  'acct_1PQXYz2Ab12Cd41',
  'acct_1PQXYz2Ab12Cd42',
  'acct_1PQXYz2Ab12Cd43'
];

const dummyTransferIds = [
  'tr_1PQXYz2Ab12Cd34',
  'tr_1PQXYz2Ab12Cd35',
  'tr_1PQXYz2Ab12Cd36', 
  'tr_1PQXYz2Ab12Cd37',
  'tr_1PQXYz2Ab12Cd38',
  'tr_1PQXYz2Ab12Cd39',
  'tr_1PQXYz2Ab12Cd40',
  'tr_1PQXYz2Ab12Cd41',
  'tr_1PQXYz2Ab12Cd42',
  'tr_1PQXYz2Ab12Cd43',
  'tr_1PQXYz2Ab12Cd44',
  'tr_1PQXYz2Ab12Cd45',
  'tr_1PQXYz2Ab12Cd46',
  'tr_1PQXYz2Ab12Cd47',
  'tr_1PQXYz2Ab12Cd48',
  'tr_1PQXYz2Ab12Cd49',
  'tr_1PQXYz2Ab12Cd50'
];

// Helper functions
function randomRecentDate(daysAgo = 30) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
  const randomTime = pastDate.getTime() + Math.random() * (now.getTime() - pastDate.getTime());
  return new Date(randomTime);
}

function randomAmount() {
  return Math.round((25 + Math.random() * 475) * 100) / 100;
}

// Step 1: Update some users to have active Stripe accounts
async function createActiveStripeUsers() {
  console.log('\n🔄 Step 1: Creating active Stripe Connect users...');
  
  try {
    // Get first 10 users and make them have active Stripe accounts
    const users = await User.find({}).limit(10);
    console.log(`📊 Updating ${users.length} users with active Stripe accounts`);
    
    let updatedCount = 0;
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      
      const stripeConnectData = {
        account_id: dummyStripeAccounts[i % dummyStripeAccounts.length],
        account_status: 'active',
        onboarding_completed: true,
        charges_enabled: false,
        payouts_enabled: true,
        details_submitted: true,
        onboarding_url: '',
        last_updated: randomRecentDate(10)
      };
      
      await User.findByIdAndUpdate(user._id, {
        $set: { stripe_connect: stripeConnectData }
      });
      
      console.log(`✅ Updated user: ${user.email} - Active Stripe account`);
      updatedCount++;
    }
    
    console.log(`✅ Created ${updatedCount} active Stripe users`);
    return updatedCount;
    
  } catch (error) {
    console.error('❌ Error creating active Stripe users:', error);
    throw error;
  }
}

// Step 2: Create dummy Stripe payout data for existing orders
async function createDummyStripePayouts() {
  console.log('\n🔄 Step 2: Creating dummy Stripe payout data...');
  
  try {
    // Get first 20 orders that have equipment
    const orders = await Order.find({})
      .populate('equipmentId', 'ownerId title')
      .limit(20);
    
    console.log(`📊 Found ${orders.length} orders to add Stripe payout data`);
    
    // Predefined transfer statuses to ensure we have examples of each
    const transferStatuses = [
      'completed', 'completed', 'completed', 'completed', 'completed', // 5 completed
      'completed', 'completed', 'completed', 'completed', 'completed', // 5 more completed
      'processing', 'processing', 'processing',                          // 3 processing
      'pending', 'pending',                                             // 2 pending
      'failed', 'failed'                                                // 2 failed
    ];
    
    let updatedCount = 0;
    
    for (let i = 0; i < Math.min(orders.length, 17); i++) {
      const order = orders[i];
      
      if (!order.equipmentId) {
        console.log(`⚠️ Skipping order ${order._id} - No equipment found`);
        continue;
      }
      
      const status = transferStatuses[i] || 'completed';
      const transferAmount = randomAmount();
      const triggeredAt = randomRecentDate(20);
      
      let completedAt = null;
      let failureReason = '';
      
      switch (status) {
        case 'completed':
          completedAt = new Date(triggeredAt.getTime() + (1 + Math.random() * 4) * 24 * 60 * 60 * 1000);
          break;
        case 'processing':
          // Processing for 1-2 days
          break;
        case 'pending':
          // Just triggered
          break;
        case 'failed':
          failureReason = i % 2 === 0 ? 
            'Account temporarily restricted - please contact support' :
            'Invalid bank account information';
          break;
      }
      
      const stripePayoutData = {
        payment_intent_id: `pi_test_${Date.now()}_${i}`,
        transfer_id: dummyTransferIds[i % dummyTransferIds.length],
        transfer_status: status,
        transfer_amount: transferAmount,
        transfer_triggered_at: triggeredAt,
        transfer_completed_at: completedAt,
        transfer_failure_reason: failureReason,
        destination_account_id: dummyStripeAccounts[i % dummyStripeAccounts.length]
      };
      
      await Order.findByIdAndUpdate(order._id, {
        $set: { stripe_payout: stripePayoutData }
      });
      
      console.log(`✅ Added ${status} transfer: ${order._id} - $${transferAmount} - Equipment: ${order.equipmentId?.title || 'Unknown'}`);
      updatedCount++;
    }
    
    console.log(`✅ Created ${updatedCount} dummy Stripe payouts`);
    return updatedCount;
    
  } catch (error) {
    console.error('❌ Error creating dummy payouts:', error);
    throw error;
  }
}

// Step 3: Create some users with different Stripe statuses
async function createDiverseStripeStatuses() {
  console.log('\n🔄 Step 3: Creating diverse Stripe Connect statuses...');
  
  try {
    // Get users 11-20 and give them different statuses
    const users = await User.find({}).skip(10).limit(10);
    console.log(`📊 Adding diverse statuses to ${users.length} users`);
    
    const statuses = [
      'not_connected', 'not_connected', 'not_connected', // 3 not connected
      'pending', 'pending',                              // 2 pending  
      'active', 'active', 'active',                      // 3 active
      'disabled'                                         // 1 disabled
    ];
    
    let updatedCount = 0;
    
    for (let i = 0; i < users.length && i < statuses.length; i++) {
      const user = users[i];
      const status = statuses[i];
      
      let stripeConnectData = {};
      
      switch (status) {
        case 'not_connected':
          stripeConnectData = {
            account_id: '',
            account_status: 'not_connected',
            onboarding_completed: false,
            charges_enabled: false,
            payouts_enabled: false,
            details_submitted: false,
            onboarding_url: '',
            last_updated: null
          };
          break;
          
        case 'pending':
          stripeConnectData = {
            account_id: dummyStripeAccounts[i % dummyStripeAccounts.length],
            account_status: 'pending',
            onboarding_completed: false,
            charges_enabled: false,
            payouts_enabled: false,
            details_submitted: false,
            onboarding_url: 'https://connect.stripe.com/setup/e/acct_test/...',
            last_updated: randomRecentDate(5)
          };
          break;
          
        case 'active':
          stripeConnectData = {
            account_id: dummyStripeAccounts[i % dummyStripeAccounts.length],
            account_status: 'active',
            onboarding_completed: true,
            charges_enabled: false,
            payouts_enabled: true,
            details_submitted: true,
            onboarding_url: '',
            last_updated: randomRecentDate(15)
          };
          break;
          
        case 'disabled':
          stripeConnectData = {
            account_id: dummyStripeAccounts[i % dummyStripeAccounts.length],
            account_status: 'disabled',
            onboarding_completed: true,
            charges_enabled: false,
            payouts_enabled: false,
            details_submitted: true,
            onboarding_url: '',
            last_updated: randomRecentDate(7)
          };
          break;
      }
      
      await User.findByIdAndUpdate(user._id, {
        $set: { stripe_connect: stripeConnectData }
      });
      
      console.log(`✅ Updated user: ${user.email} - Status: ${status}`);
      updatedCount++;
    }
    
    console.log(`✅ Created ${updatedCount} diverse Stripe statuses`);
    return updatedCount;
    
  } catch (error) {
    console.error('❌ Error creating diverse statuses:', error);
    throw error;
  }
}

// Step 4: Verify and show summary
async function verifyAndShowSummary() {
  console.log('\n🔄 Step 4: Verifying data and showing summary...');
  
  try {
    // Count users by Stripe Connect status
    const userStats = await User.aggregate([
      {
        $group: {
          _id: '$stripe_connect.account_status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    console.log('\n📊 User Stripe Connect Status Summary:');
    userStats.forEach(stat => {
      console.log(`   ${stat._id || 'undefined/null'}: ${stat.count} users`);
    });
    
    // Count orders by transfer status
    const orderStats = await Order.aggregate([
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
      }
    ]);
    
    console.log('\n💳 Stripe Transfer Status Summary:');
    let totalTransfers = 0;
    let totalAmount = 0;
    
    orderStats.forEach(stat => {
      console.log(`   ${stat._id}: ${stat.count} transfers - $${stat.total_amount.toFixed(2)}`);
      totalTransfers += stat.count;
      totalAmount += stat.total_amount;
    });
    
    console.log(`   📈 TOTAL: ${totalTransfers} transfers - $${totalAmount.toFixed(2)}`);
    
    // Test the finance API query with our new data
    const financeApiTest = await Order.find({
      'stripe_payout': { $exists: true, $ne: null },
      'stripe_payout.transfer_id': { $ne: '', $exists: true }
    });
    
    console.log(`\n✅ Finance API Test: Found ${financeApiTest.length} transfers ready for frontend`);
    
    // Show some sample data
    if (financeApiTest.length > 0) {
      console.log('\n📋 Sample Transfer Data:');
      financeApiTest.slice(0, 3).forEach((order, index) => {
        console.log(`   ${index + 1}. Order ${order._id}: ${order.stripe_payout.transfer_status} - $${order.stripe_payout.transfer_amount}`);
      });
    }
    
    return { userStats, orderStats, totalTransfers, totalAmount };
    
  } catch (error) {
    console.error('❌ Error verifying data:', error);
    throw error;
  }
}

// Main execution function
async function main() {
  console.log('🚀 Creating Dummy Stripe Connect Data for Frontend Testing...');
  console.log('='.repeat(70));
  
  try {
    await connectDB();
    
    const activeUsers = await createActiveStripeUsers();
    const payoutData = await createDummyStripePayouts();
    const diverseStatuses = await createDiverseStripeStatuses();
    const summary = await verifyAndShowSummary();
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 Dummy Data Creation Completed Successfully!');
    console.log('='.repeat(70));
    console.log(`📊 Summary:`);
    console.log(`   • Active Stripe users created: ${activeUsers}`);
    console.log(`   • Dummy payouts created: ${payoutData}`);
    console.log(`   • Diverse status users created: ${diverseStatuses}`);
    console.log(`   • Total transfers available: ${summary.totalTransfers}`);
    console.log(`   • Total transfer amount: $${summary.totalAmount.toFixed(2)}`);
    
    console.log('\n🔗 APIs Now Ready with Test Data:');
    console.log('   • GET /admin/dashboard/summary');
    console.log('     → Will show Stripe Payouts and Failed Transfers cards with real counts');
    console.log('   • GET /admin/finance/withdrawals?type=stripe');
    console.log('     → Will return actual Stripe transfers with different statuses');
    console.log('   • GET /admin/finance/stripe-transfer-details/:orderId');
    console.log('     → Will show complete transfer information');
    
    console.log('\n📱 Frontend Integration Ready:');
    console.log('   ✅ Dashboard will show non-zero Stripe stats');
    console.log('   ✅ Finance page will display actual transfer data');
    console.log('   ✅ All transfer statuses available for testing');
    console.log('   ✅ Time remaining calculations will work');
    console.log('   ✅ Failed transfers will trigger alerts');
    
  } catch (error) {
    console.error('\n❌ Dummy Data Creation Failed:', error);
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
