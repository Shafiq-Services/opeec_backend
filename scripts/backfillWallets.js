/**
 * Backfill Script for Seller Wallets
 * 
 * This script safely creates SellerWallet documents for existing sellers
 * and optionally recomputes cached balances from TransactionLog entries.
 * 
 * Usage:
 * node scripts/backfillWallets.js [--recompute-balances]
 * 
 * Options:
 * --recompute-balances: Force recomputation of all wallet balances from transaction logs
 */

const mongoose = require('mongoose');
const path = require('path');

// Import models and services
require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/user');
const Equipment = require('../models/equipment');
const SellerWallet = require('../models/sellerWallet');
const { ensureWallet, computeAndUpdateBalance } = require('../utils/walletService');

// Configuration
const BATCH_SIZE = 50; // Process sellers in batches
const DRY_RUN = process.argv.includes('--dry-run');
const RECOMPUTE_BALANCES = process.argv.includes('--recompute-balances');

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
 * Backfill wallets for all sellers
 */
async function backfillWallets() {
  try {
    console.log('🚀 Starting wallet backfill process...');
    console.log(`📋 Configuration: DRY_RUN=${DRY_RUN}, RECOMPUTE_BALANCES=${RECOMPUTE_BALANCES}, BATCH_SIZE=${BATCH_SIZE}`);
    
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
    console.log('🏦 OPEEC Wallet Backfill Script');
    console.log('================================');
    
    // Connect to database
    await connectDB();
    console.log('✅ Connected to MongoDB');
    
    // Run validation first
    await validateWalletData();
    
    // Run backfill
    await backfillWallets();
    
    console.log('\n🎉 Backfill process completed successfully!');
    
  } catch (error) {
    console.error('❌ Backfill process failed:', error);
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
🏦 OPEEC Wallet Backfill Script

Usage: node scripts/backfillWallets.js [options]

Options:
  --dry-run              Run without making any changes (preview mode)
  --recompute-balances   Force recomputation of all wallet balances
  --help, -h             Show this help message

Examples:
  node scripts/backfillWallets.js                    # Create missing wallets
  node scripts/backfillWallets.js --dry-run          # Preview what would be created
  node scripts/backfillWallets.js --recompute-balances  # Create + recompute all balances
    `);
    process.exit(0);
  }
  
  // Run the script
  main();
}

module.exports = {
  backfillWallets,
  validateWalletData,
  getAllSellerIds
};
