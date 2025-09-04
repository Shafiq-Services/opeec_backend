/**
 * Wallet Migration & Backfill Script
 * 
 * This script migrates existing data to the new wallet structure by:
 * 1. Clearing old wallet data (if requested)
 * 2. Rebuilding transaction logs from existing orders
 * 3. Creating new SellerWallet documents with correct balances
 * 
 * Usage:
 * node scripts/backfillWallets.js [options]
 * 
 * Options:
 * --clear-existing: Remove all existing wallet data and rebuild from scratch
 * --recompute-balances: Force recomputation of all wallet balances from transaction logs
 * --migrate-orders: Create transaction logs from existing completed orders
 */

const mongoose = require('mongoose');
const path = require('path');
const readline = require('readline');

// Import models and services
require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/user');
const Equipment = require('../models/equipment');
const Order = require('../models/orders');
const SellerWallet = require('../models/sellerWallet');
const TransactionLog = require('../models/transactionLog');
const WithdrawalRequest = require('../models/withdrawalRequest');
const { ensureWallet, computeAndUpdateBalance, createTransaction } = require('../utils/walletService');
const { validateOrderForSettlement, determineSettlement } = require('../utils/settlementRules');

// Configuration
const BATCH_SIZE = 50; // Process sellers in batches
const DRY_RUN = process.argv.includes('--dry-run');
const CLEAR_EXISTING = process.argv.includes('--clear-existing');
const RECOMPUTE_BALANCES = process.argv.includes('--recompute-balances');
const MIGRATE_ORDERS = process.argv.includes('--migrate-orders');

/**
 * Get all unique seller IDs (users who own equipment)
 */
async function getAllSellerIds() {
  try {
    console.log('🔍 Finding all sellers (users who own equipment)...');
    
    const sellerIds = await Equipment.distinct('ownerId');
    console.log(`✅ Found ${sellerIds.length} unique sellers`);
    
    return sellerIds;
  } catch (error) {
    console.error('❌ Error finding sellers:', error);
    throw error;
  }
}

/**
 * Create wallet for a single seller if it doesn't exist
 */
async function createWalletForSeller(sellerId) {
  try {
    const existingWallet = await SellerWallet.findOne({ sellerId });
    
    if (existingWallet) {
      return { created: false, wallet: existingWallet };
    }
    
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would create wallet for seller: ${sellerId}`);
      return { created: true, wallet: null };
    }
    
    const wallet = await ensureWallet(sellerId);
    console.log(`✅ Created wallet for seller: ${sellerId}`);
    
    return { created: true, wallet };
  } catch (error) {
    console.error(`❌ Error creating wallet for seller ${sellerId}:`, error);
    throw error;
  }
}

/**
 * Get user confirmation for destructive operations
 */
async function getUserConfirmation(message) {
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would ask: ${message}`);
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Clear existing wallet data
 */
async function clearExistingWalletData() {
  try {
    console.log('🗑️  Clearing existing wallet data...');
    
    if (!DRY_RUN) {
      const confirmed = await getUserConfirmation('⚠️  This will DELETE ALL existing wallet data. Are you sure?');
      if (!confirmed) {
        console.log('❌ Operation cancelled by user');
        process.exit(0);
      }
    }

    // Count existing documents
    const [walletCount, transactionCount, withdrawalCount] = await Promise.all([
      SellerWallet.countDocuments(),
      TransactionLog.countDocuments(),
      WithdrawalRequest.countDocuments()
    ]);

    console.log(`📊 Found existing data:`);
    console.log(`   💳 SellerWallets: ${walletCount}`);
    console.log(`   📝 TransactionLogs: ${transactionCount}`);
    console.log(`   💸 WithdrawalRequests: ${withdrawalCount}`);

    if (DRY_RUN) {
      console.log('[DRY RUN] Would delete all wallet data');
      return;
    }

    // Clear all wallet-related collections
    await Promise.all([
      SellerWallet.deleteMany({}),
      TransactionLog.deleteMany({}),
      WithdrawalRequest.deleteMany({})
    ]);

    console.log('✅ All existing wallet data cleared');

  } catch (error) {
    console.error('❌ Error clearing existing data:', error);
    throw error;
  }
}

/**
 * Migrate existing orders to transaction logs
 */
async function migrateOrdersToTransactions() {
  try {
    console.log('📦 Migrating existing orders to transaction logs...');

    // Get all completed orders with proper pricing data
    const completedOrders = await Order.find({
      rental_status: { $in: ['Finished', 'Returned'] },
      rental_fee: { $exists: true, $gt: 0 }
    }).populate('equipmentId', 'ownerId title').lean();

    console.log(`📋 Found ${completedOrders.length} completed orders to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const order of completedOrders) {
      try {
        if (!order.equipmentId || !order.equipmentId.ownerId) {
          console.log(`⚠️  Skipping order ${order._id} - missing equipment owner`);
          skippedCount++;
          continue;
        }

        const sellerId = order.equipmentId.ownerId;

        // Validate order for settlement
        const validation = validateOrderForSettlement(order);
        if (!validation.isValid) {
          console.log(`⚠️  Skipping order ${order._id} - ${validation.reason}`);
          skippedCount++;
          continue;
        }

        if (DRY_RUN) {
          console.log(`[DRY RUN] Would create ORDER_EARNING transaction for order ${order._id}: $${order.rental_fee}`);
          migratedCount++;
          continue;
        }

        // Create ORDER_EARNING transaction for completed orders
        await createTransaction({
          sellerId,
          type: 'ORDER_EARNING',
          amount: order.rental_fee,
          description: `Migrated earnings from completed order`,
          orderId: order._id,
          metadata: {
            order_breakdown: {
              rental_fee: order.rental_fee,
              platform_fee: order.platform_fee || 0,
              tax_amount: order.tax_amount || 0,
              insurance_amount: order.insurance_amount || 0,
              deposit_amount: order.deposit_amount || 0,
              total_amount: order.total_amount || 0
            },
            equipment_title: order.equipmentId.title,
            migration_note: 'Migrated from existing order data'
          }
        });

        // Handle penalties if they exist
        if (order.penalty_amount && order.penalty_amount > 0) {
          const depositAmount = order.deposit_amount || 0;
          if (order.penalty_amount > depositAmount) {
            const sellerPenalty = order.penalty_amount - depositAmount;
            
            await createTransaction({
              sellerId,
              type: 'PENALTY',
              amount: -sellerPenalty,
              description: `Migrated penalty from order (exceeds deposit)`,
              orderId: order._id,
              metadata: {
                total_penalty: order.penalty_amount,
                deposit_coverage: depositAmount,
                seller_responsibility: sellerPenalty,
                migration_note: 'Migrated from existing order data'
              }
            });
          }
        }

        migratedCount++;
        
        // Brief pause to avoid overwhelming the database
        if (migratedCount % 50 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.error(`❌ Error migrating order ${order._id}:`, error);
        skippedCount++;
      }
    }

    console.log('📊 Migration Summary:');
    console.log(`   ✅ Orders migrated: ${migratedCount}`);
    console.log(`   ⚠️  Orders skipped: ${skippedCount}`);

  } catch (error) {
    console.error('❌ Error migrating orders:', error);
    throw error;
  }
}

/**
 * Backfill wallets for all sellers
 */
async function backfillWallets() {
  try {
    console.log('🚀 Starting wallet backfill process...');
    console.log(`📋 Configuration: DRY_RUN=${DRY_RUN}, CLEAR_EXISTING=${CLEAR_EXISTING}, MIGRATE_ORDERS=${MIGRATE_ORDERS}, RECOMPUTE_BALANCES=${RECOMPUTE_BALANCES}`);
    
    // Get all seller IDs
    const sellerIds = await getAllSellerIds();
    
    if (sellerIds.length === 0) {
      console.log('ℹ️ No sellers found. Nothing to backfill.');
      return;
    }
    
    // Process sellers in batches
    let created = 0;
    let existing = 0;
    let recomputed = 0;
    
    for (let i = 0; i < sellerIds.length; i += BATCH_SIZE) {
      const batch = sellerIds.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(sellerIds.length / BATCH_SIZE)} (${batch.length} sellers)...`);
      
      for (const sellerId of batch) {
        try {
          // Create wallet if needed
          const result = await createWalletForSeller(sellerId);
          
          if (result.created) {
            created++;
          } else {
            existing++;
          }
          
          // Recompute balances if requested
          if (RECOMPUTE_BALANCES && !DRY_RUN) {
            console.log(`🔄 Recomputing balances for seller: ${sellerId}`);
            await computeAndUpdateBalance(sellerId);
            recomputed++;
          }
          
        } catch (error) {
          console.error(`❌ Failed to process seller ${sellerId}:`, error);
          // Continue with other sellers
        }
      }
      
      // Brief pause between batches to avoid overwhelming the database
      if (i + BATCH_SIZE < sellerIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('\n📊 Backfill Summary:');
    console.log(`   👥 Total sellers processed: ${sellerIds.length}`);
    console.log(`   ✅ Wallets created: ${created}`);
    console.log(`   📋 Existing wallets: ${existing}`);
    if (RECOMPUTE_BALANCES) {
      console.log(`   🔄 Balances recomputed: ${recomputed}`);
    }
    console.log(`   💾 Mode: ${DRY_RUN ? 'DRY RUN (no changes made)' : 'LIVE (changes applied)'}`);
    
  } catch (error) {
    console.error('❌ Error during wallet backfill:', error);
    throw error;
  }
}

/**
 * Validate existing wallet data integrity
 */
async function validateWalletData() {
  try {
    console.log('🔍 Validating wallet data integrity...');
    
    const issues = [];
    
    // Check for wallets with negative balances
    const negativeBalanceWallets = await SellerWallet.find({
      $or: [
        { available_balance: { $lt: 0 } },
        { pending_balance: { $lt: 0 } },
        { total_balance: { $lt: 0 } }
      ]
    });
    
    if (negativeBalanceWallets.length > 0) {
      issues.push(`Found ${negativeBalanceWallets.length} wallets with negative balances`);
    }
    
    // Check for wallets without corresponding users
    const walletsWithoutUsers = await SellerWallet.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'sellerId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $match: { user: { $size: 0 } }
      }
    ]);
    
    if (walletsWithoutUsers.length > 0) {
      issues.push(`Found ${walletsWithoutUsers.length} wallets with invalid seller references`);
    }
    
    if (issues.length > 0) {
      console.log('⚠️ Validation Issues Found:');
      issues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log('✅ All wallet data appears to be valid');
    }
    
    return issues;
    
  } catch (error) {
    console.error('❌ Error validating wallet data:', error);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('🏦 OPEEC Wallet Migration & Backfill Script');
    console.log('==========================================');
    
    // Connect to database
    await connectDB();
    console.log('✅ Connected to MongoDB');
    
    // Step 1: Clear existing data if requested
    if (CLEAR_EXISTING) {
      await clearExistingWalletData();
    }
    
    // Step 2: Migrate existing orders to transaction logs
    if (MIGRATE_ORDERS) {
      await migrateOrdersToTransactions();
    }
    
    // Step 3: Run validation
    if (!CLEAR_EXISTING) {
      await validateWalletData();
    }
    
    // Step 4: Create/update wallets
    await backfillWallets();
    
    // Step 5: Final validation
    if (!DRY_RUN) {
      console.log('\n🔍 Running final validation...');
      await validateWalletData();
    }
    
    console.log('\n🎉 Migration and backfill process completed successfully!');
    
    // Show next steps
    if (!DRY_RUN) {
      console.log('\n📋 Next Steps:');
      console.log('1. ✅ Wallet system is ready for use');
      console.log('2. 🧪 Test wallet endpoints with existing users');
      console.log('3. 📊 Monitor transaction logs for accuracy');
      console.log('4. 🔔 Set up admin notifications for new withdrawal requests');
    }
    
  } catch (error) {
    console.error('❌ Migration process failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Handle script execution
if (require.main === module) {
  // Show help if requested
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🏦 OPEEC Wallet Migration & Backfill Script

Usage: node scripts/backfillWallets.js [options]

Options:
  --dry-run              Run without making any changes (preview mode)
  --clear-existing       Remove ALL existing wallet data and rebuild from scratch
  --migrate-orders       Create transaction logs from existing completed orders  
  --recompute-balances   Force recomputation of all wallet balances
  --help, -h             Show this help message

⚠️  DESTRUCTIVE OPTIONS:
  --clear-existing will DELETE all SellerWallets, TransactionLogs, and WithdrawalRequests!

Examples:
  # Safe operations (recommended first)
  node scripts/backfillWallets.js --dry-run                    # Preview changes
  node scripts/backfillWallets.js --dry-run --clear-existing   # Preview full rebuild
  
  # Create missing wallets only
  node scripts/backfillWallets.js                              # Create missing wallets
  
  # Full migration (DESTRUCTIVE - use with caution)
  node scripts/backfillWallets.js --clear-existing --migrate-orders --recompute-balances
  
  # Migrate orders without clearing (if you have existing wallets)
  node scripts/backfillWallets.js --migrate-orders --recompute-balances
    `);
    process.exit(0);
  }
  
  // Show warning for destructive operations
  if (CLEAR_EXISTING && !DRY_RUN) {
    console.log('⚠️  WARNING: --clear-existing will DELETE ALL existing wallet data!');
    console.log('💡 Consider running with --dry-run first to preview changes');
    console.log('');
  }
  
  // Run the script
  main();
}

module.exports = {
  backfillWallets,
  validateWalletData,
  getAllSellerIds,
  clearExistingWalletData,
  migrateOrdersToTransactions,
  getUserConfirmation
};
