/**
 * Critical Bug Fix Script - Fix Double Deduction in Wallet Balances
 * 
 * This script fixes the critical double deduction bug that was causing
 * wallets to show incorrect (lower) balances when withdrawal requests were made.
 * 
 * The bug: WITHDRAW_REQUEST_HOLD transactions were being subtracted twice:
 * 1. Once in totalBalance calculation (correct)
 * 2. Once again in availableBalance calculation (incorrect)
 * 
 * This script will recompute all wallet balances using the fixed logic.
 */

const mongoose = require('mongoose');
const SellerWallet = require('../models/sellerWallet');
const TransactionLog = require('../models/transactionLog');
const WithdrawalRequest = require('../models/withdrawalRequest');
const User = require('../models/user');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opeec';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

/**
 * Fixed balance calculation (without double deduction)
 */
async function computeFixedBalance(sellerId) {
  try {
    // Get all completed transactions for this seller
    const transactions = await TransactionLog.find({
      sellerId,
      status: 'completed'
    }).sort({ createdAt: 1 });

    // Calculate total balance from all transactions
    let totalBalance = 0;
    let lastTransactionId = null;

    for (const transaction of transactions) {
      totalBalance += transaction.amount;
      lastTransactionId = transaction._id;
    }

    // Get pending withdrawals (for display purposes only)
    const pendingWithdrawals = await WithdrawalRequest.find({
      sellerId,
      status: { $in: ['Pending', 'Approved'] }
    });

    const pendingBalance = pendingWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
    
    // FIXED: Available balance is the total balance
    // WITHDRAW_REQUEST_HOLD transactions already reduce totalBalance, no double deduction!
    const availableBalance = Math.max(0, totalBalance);

    return {
      available_balance: Math.round(availableBalance * 100) / 100,
      pending_balance: Math.round(pendingBalance * 100) / 100,
      total_balance: Math.round(totalBalance * 100) / 100,
      last_transaction_id: lastTransactionId,
      transaction_count: transactions.length,
      pending_withdrawal_count: pendingWithdrawals.length
    };
  } catch (error) {
    console.error(`Error computing balance for seller ${sellerId}:`, error);
    throw error;
  }
}

/**
 * Fix wallet balances for all users
 */
async function fixAllWalletBalances() {
  try {
    console.log('🔧 Starting wallet balance fix process...');
    
    // Get all wallets that exist
    const existingWallets = await SellerWallet.find({}).lean();
    console.log(`📋 Found ${existingWallets.length} existing wallets to fix`);
    
    let fixedCount = 0;
    let errorCount = 0;
    let totalRecovered = 0;
    
    for (const wallet of existingWallets) {
      try {
        const sellerId = wallet.sellerId;
        
        // Get user info for logging
        const user = await User.findById(sellerId).select('name email').lean();
        const userName = user ? `${user.name} (${user.email})` : `Unknown User (${sellerId})`;
        
        // Calculate correct balances
        const oldBalance = wallet.available_balance;
        const fixedBalances = await computeFixedBalance(sellerId);
        const newBalance = fixedBalances.available_balance;
        const recovered = newBalance - oldBalance;
        
        if (VERBOSE || Math.abs(recovered) > 0.01) {
          console.log(`\n👤 ${userName}`);
          console.log(`   Old Available: $${oldBalance}`);
          console.log(`   New Available: $${newBalance}`);
          console.log(`   Recovered: $${recovered.toFixed(2)}`);
          console.log(`   Transactions: ${fixedBalances.transaction_count}`);
          console.log(`   Pending Withdrawals: ${fixedBalances.pending_withdrawal_count}`);
        }
        
        if (!DRY_RUN) {
          // Update wallet with fixed balances
          await SellerWallet.findOneAndUpdate(
            { sellerId },
            {
              available_balance: fixedBalances.available_balance,
              pending_balance: fixedBalances.pending_balance,
              total_balance: fixedBalances.total_balance,
              last_transaction_id: fixedBalances.last_transaction_id,
              balance_updated_at: new Date()
            }
          );
        }
        
        fixedCount++;
        totalRecovered += recovered;
        
      } catch (error) {
        console.error(`❌ Error fixing wallet for ${wallet.sellerId}:`, error);
        errorCount++;
      }
    }
    
    console.log('\n🎉 Wallet balance fix completed!');
    console.log(`✅ Fixed: ${fixedCount} wallets`);
    console.log(`❌ Errors: ${errorCount} wallets`);
    console.log(`💰 Total recovered: $${totalRecovered.toFixed(2)}`);
    
    if (DRY_RUN) {
      console.log('\n⚠️  DRY RUN MODE - No changes were made to the database');
      console.log('   Run without --dry-run to apply the fixes');
    }
    
    return { fixedCount, errorCount, totalRecovered };
    
  } catch (error) {
    console.error('❌ Error in fix process:', error);
    throw error;
  }
}

/**
 * Test the fix with a specific user
 */
async function testFixWithUser(userEmail) {
  try {
    console.log(`🧪 Testing fix for user: ${userEmail}`);
    
    const user = await User.findOne({ email: userEmail }).lean();
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    const fixedBalances = await computeFixedBalance(user._id);
    
    console.log('📊 Test Results:');
    console.log(`   Available Balance: $${fixedBalances.available_balance}`);
    console.log(`   Pending Balance: $${fixedBalances.pending_balance}`);
    console.log(`   Total Balance: $${fixedBalances.total_balance}`);
    console.log(`   Transaction Count: ${fixedBalances.transaction_count}`);
    console.log(`   Pending Withdrawals: ${fixedBalances.pending_withdrawal_count}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('🏦 OPEEC Wallet Balance Fix Script');
    console.log('==================================');
    console.log('Fixing critical double deduction bug in wallet calculations');
    
    if (DRY_RUN) {
      console.log('⚠️  Running in DRY RUN mode - no changes will be made');
    }
    
    // Connect to database
    await connectDB();
    
    // Check for test user argument
    const testUserIndex = process.argv.indexOf('--test-user');
    if (testUserIndex !== -1 && process.argv[testUserIndex + 1]) {
      const userEmail = process.argv[testUserIndex + 1];
      await testFixWithUser(userEmail);
    } else {
      // Fix all wallet balances
      await fixAllWalletBalances();
    }
    
    console.log('\n✅ Process completed successfully!');
    
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Handle script execution
if (require.main === module) {
  main();
}

module.exports = { computeFixedBalance, fixAllWalletBalances, testFixWithUser };

