const User = require('../models/user');
const Order = require('../models/orders');
const Equipment = require('../models/equipment');
const mongoose = require('mongoose');
const { getWalletBalances, ensureWallet } = require('../utils/walletService');

// Get comprehensive dashboard data matching the admin panel UI
exports.getDashboardData = async (req, res) => {
  try {
    const { period = 'this_month' } = req.query;
    
    console.log("📊 Fetching comprehensive dashboard data...");
    
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    
    // Helper functions
    const formatMonth = (date) => {
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };
    
    const calculatePercentageChange = (current, previous) => {
      if (previous === 0) return current > 0 ? '+100.0%' : '0.0%';
      const change = ((current - previous) / previous) * 100;
      return change >= 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`;
    };
    
    const getChangeDirection = (current, previous) => {
      if (current > previous) return 'up';
      if (current < previous) return 'down';
      return 'flat';
    };

    // 1. SUMMARY CARDS DATA
    console.log("📈 Calculating summary cards...");
    
    // Equipment counts
    const currentEquipmentCount = await Equipment.countDocuments({
      equipment_status: 'Active',
      createdAt: { $gte: currentMonth, $lt: now }
    });
    const previousEquipmentCount = await Equipment.countDocuments({
      equipment_status: 'Active',
      createdAt: { $gte: previousMonth, $lt: previousMonthEnd }
    });
    const totalEquipmentCount = await Equipment.countDocuments({ equipment_status: 'Active' });
    
    // Rental counts
    const currentRentalsCount = await Order.countDocuments({
      createdAt: { $gte: currentMonth, $lt: now }
    });
    const previousRentalsCount = await Order.countDocuments({
      createdAt: { $gte: previousMonth, $lt: previousMonthEnd }
    });
    const totalRentalsCount = await Order.countDocuments();
    
    // User counts
    const currentUsersCount = await User.countDocuments({
      createdAt: { $gte: currentMonth, $lt: now }
    });
    const previousUsersCount = await User.countDocuments({
      createdAt: { $gte: previousMonth, $lt: previousMonthEnd }
    });
    const totalUsersCount = await User.countDocuments();

    // Stripe Connect counts
    console.log("💳 Calculating Stripe Connect data...");
    
    const currentStripePayoutsCount = await Order.countDocuments({
      'stripe_payout': { $exists: true, $ne: null },
      'stripe_payout.transfer_id': { $ne: "", $exists: true },
      'stripe_payout.transfer_triggered_at': { $gte: currentMonth, $lt: now }
    });
    const previousStripePayoutsCount = await Order.countDocuments({
      'stripe_payout': { $exists: true, $ne: null },
      'stripe_payout.transfer_id': { $ne: "", $exists: true },
      'stripe_payout.transfer_triggered_at': { $gte: previousMonth, $lt: previousMonthEnd }
    });
    const totalStripePayouts = await Order.countDocuments({
      'stripe_payout': { $exists: true, $ne: null },
      'stripe_payout.transfer_id': { $ne: "", $exists: true }
    });
    const failedStripePayouts = await Order.countDocuments({
      'stripe_payout': { $exists: true, $ne: null },
      'stripe_payout.transfer_status': 'failed'
    });

    console.log("💳 Total Stripe Payouts:", totalStripePayouts);
    console.log("❌ Failed Stripe Payouts:", failedStripePayouts);

    // 2. REVENUE DATA
    console.log("💰 Calculating revenue data...");
    
    // Get all completed orders for revenue calculation
    const completedOrders = await Order.find({
      rental_status: { $in: ['Returned', 'Ongoing'] }
    }).select('total_amount rental_fee platform_fee createdAt');
    
    // Calculate total revenue (platform fees from all completed orders)
    const totalRevenue = completedOrders.reduce((sum, order) => {
      return sum + (order.platform_fee || 0);
    }, 0);
    
    // Calculate monthly revenue
    const currentMonthRevenue = completedOrders
      .filter(order => order.createdAt >= currentMonth && order.createdAt < now)
      .reduce((sum, order) => sum + (order.platform_fee || 0), 0);
    
    const previousMonthRevenue = completedOrders
      .filter(order => order.createdAt >= previousMonth && order.createdAt < previousMonthEnd)
      .reduce((sum, order) => sum + (order.platform_fee || 0), 0);
    
    // Generate daily revenue data for the current month (last 15 days)
    const dailyRevenueData = [];
    for (let i = 14; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
      
      const dayRevenue = completedOrders
        .filter(order => order.createdAt >= dayStart && order.createdAt <= dayEnd)
        .reduce((sum, order) => sum + (order.platform_fee || 0), 0);
      
      dailyRevenueData.push({
        day: date.getDate(),
        revenue: Math.round(dayRevenue * 100) / 100
      });
    }

    // 3. TOP OWNERS DATA
    console.log("👥 Calculating top owners...");
    
    // Get equipment owners with their stats
    const equipmentOwners = await Equipment.aggregate([
      { $match: { equipment_status: 'Active' } },
      {
        $group: {
          _id: '$ownerId',
          equipmentCount: { $sum: 1 },
          totalRentals: { $sum: '$rental_count' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'owner'
        }
      },
      { $unwind: '$owner' },
      {
        $project: {
          _id: '$owner._id',
          name: '$owner.name',
          email: '$owner.email',
          profile_image: '$owner.profile_image',
          equipmentCount: 1,
          totalRentals: 1
        }
      },
      { $sort: { totalRentals: -1, equipmentCount: -1 } },
      { $limit: 7 }
    ]);
    
    // Add wallet amounts to top owners
    const topOwnersWithWallets = await Promise.all(equipmentOwners.map(async (owner) => {
      let walletAmount = 0;
      try {
        await ensureWallet(owner._id);
        const balances = await getWalletBalances(owner._id);
        walletAmount = balances.available_balance + balances.pending_balance;
      } catch (walletError) {
        console.warn(`Warning: Could not fetch wallet for owner ${owner._id}:`, walletError.message);
        walletAmount = 0;
      }
      
      return {
        _id: owner._id,
        name: owner.name,
        email: owner.email,
        profile_image: owner.profile_image || '',
        equipment_count: owner.equipmentCount,
        total_rentals: owner.totalRentals,
        wallet_amount: Math.round(walletAmount * 100) / 100
      };
    }));

    // 4. ASSEMBLE RESPONSE
    const dashboardData = {
      summary_cards: [
        {
          title: "Equipments",
          count: totalEquipmentCount,
          period: formatMonth(currentMonth),
          change: calculatePercentageChange(currentEquipmentCount, previousEquipmentCount),
          change_direction: getChangeDirection(currentEquipmentCount, previousEquipmentCount),
          icon: "equipment"
        },
        {
          title: "Rentals", 
          count: totalRentalsCount,
          period: formatMonth(currentMonth),
          change: calculatePercentageChange(currentRentalsCount, previousRentalsCount),
          change_direction: getChangeDirection(currentRentalsCount, previousRentalsCount),
          icon: "rentals"
        },
        {
          title: "Users",
          count: totalUsersCount,
          period: formatMonth(currentMonth),
          change: calculatePercentageChange(currentUsersCount, previousUsersCount),
          change_direction: getChangeDirection(currentUsersCount, previousUsersCount),
          icon: "users"
        },
        {
          title: "Stripe Payouts",
          count: totalStripePayouts,
          period: formatMonth(currentMonth),
          change: calculatePercentageChange(currentStripePayoutsCount, previousStripePayoutsCount),
          change_direction: getChangeDirection(currentStripePayoutsCount, previousStripePayoutsCount),
          icon: "stripe_payouts"
        },
        {
          title: "Failed Transfers",
          count: failedStripePayouts,
          period: formatMonth(currentMonth),
          change: "0", // Failed transfers don't have monthly comparison
          change_direction: failedStripePayouts > 0 ? "up" : "flat",
          icon: "failed_transfers",
          alert: failedStripePayouts > 0 // Special flag for failed transfers
        }
      ],
      
      revenue_data: {
        total_revenue: Math.round(totalRevenue * 100) / 100,
        current_month_revenue: Math.round(currentMonthRevenue * 100) / 100,
        previous_month_revenue: Math.round(previousMonthRevenue * 100) / 100,
        revenue_change: calculatePercentageChange(currentMonthRevenue, previousMonthRevenue),
        revenue_change_direction: getChangeDirection(currentMonthRevenue, previousMonthRevenue),
        period: formatMonth(currentMonth),
        daily_trend: dailyRevenueData
      },
      
      top_owners: topOwnersWithWallets,
      
      metadata: {
        generated_at: new Date(),
        period: period,
        current_month: formatMonth(currentMonth)
      }
    };

    console.log("✅ Dashboard data generated successfully");
    console.log(`📊 Summary: ${totalEquipmentCount} equipments, ${totalRentalsCount} rentals, ${totalUsersCount} users`);
    console.log(`💰 Revenue: $${totalRevenue.toFixed(2)} total, $${currentMonthRevenue.toFixed(2)} this month`);
    console.log(`👥 Top owners: ${topOwnersWithWallets.length} owners listed`);

    res.status(200).json({
      message: 'Dashboard data retrieved successfully',
      data: dashboardData
    });

  } catch (error) {
    console.error('❌ Error in dashboard data:', error);
    res.status(500).json({
      message: 'Error retrieving dashboard data',
      error: error.message
    });
  }
};

// Legacy summary endpoint (keeping for backward compatibility)
exports.summary = async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    console.log("🗓️ Current Date:", now);
    console.log("📆 Current Month Start:", currentMonth);
    console.log("📆 Previous Month Start:", previousMonth);
    console.log("📆 Previous Month End:", previousMonthEnd);

    const formatMonth = (date) => {
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const calculatePercentageChange = (current, previous) => {
      if (previous === 0) return current > 0 ? '+100' : '0';
      const change = ((current - previous) / previous) * 100;
      return change >= 0 ? `+${change.toFixed(1)}` : change.toFixed(1);
    };

    const getChangeInfo = (current, previous) => {
      if (current > previous) return { direction: 'up', color: '#22c55e' };
      if (current < previous) return { direction: 'down', color: '#ef4444' };
      return { direction: 'up', color: '#6b7280' };
    };

    // Monthly counts
    const currentUsersCount = await User.countDocuments({
      createdAt: { $gte: currentMonth, $lt: now }
    });
    const previousUsersCount = await User.countDocuments({
      createdAt: { $gte: previousMonth, $lt: previousMonthEnd }
    });

    console.log("👥 Users - Current Month:", currentUsersCount);
    console.log("👥 Users - Previous Month:", previousUsersCount);

    const currentRentalsCount = await Order.countDocuments({
      createdAt: { $gte: currentMonth, $lt: now }
    });
    const previousRentalsCount = await Order.countDocuments({
      createdAt: { $gte: previousMonth, $lt: previousMonthEnd }
    });

    console.log("📦 Rentals - Current Month:", currentRentalsCount);
    console.log("📦 Rentals - Previous Month:", previousRentalsCount);

    const currentEquipmentCount = await Equipment.countDocuments({
      equipment_status: 'Active',
      createdAt: { $gte: currentMonth, $lt: now }
    });

    const previousEquipmentCount = await Equipment.countDocuments({
      equipment_status: 'Active',
      createdAt: { $gte: previousMonth, $lt: previousMonthEnd }
    });

    console.log("🛠️ Equipments - Current Month:", currentEquipmentCount);
    console.log("🛠️ Equipments - Previous Month:", previousEquipmentCount);

    // Total counts
    const totalUsers = await User.countDocuments();
    const totalRentals = await Order.countDocuments();
    const totalEquipments = await Equipment.countDocuments({ equipment_status: 'Active' });

    // Stripe Connect counts
    const currentStripePayoutsCount = await Order.countDocuments({
      'stripe_payout': { $exists: true, $ne: null },
      'stripe_payout.transfer_id': { $ne: "", $exists: true },
      'stripe_payout.transfer_triggered_at': { $gte: currentMonth, $lt: now }
    });
    const previousStripePayoutsCount = await Order.countDocuments({
      'stripe_payout': { $exists: true, $ne: null },
      'stripe_payout.transfer_id': { $ne: "", $exists: true },
      'stripe_payout.transfer_triggered_at': { $gte: previousMonth, $lt: previousMonthEnd }
    });
    const totalStripePayouts = await Order.countDocuments({
      'stripe_payout': { $exists: true, $ne: null },
      'stripe_payout.transfer_id': { $ne: "", $exists: true }
    });
    const failedStripePayouts = await Order.countDocuments({
      'stripe_payout': { $exists: true, $ne: null },
      'stripe_payout.transfer_status': 'failed'
    });

    console.log("📊 Total Users:", totalUsers);
    console.log("📊 Total Rentals:", totalRentals);
    console.log("📊 Total Active Equipments:", totalEquipments);
    console.log("💳 Total Stripe Payouts:", totalStripePayouts);
    console.log("❌ Failed Stripe Payouts:", failedStripePayouts);

    // Percentage changes
    const usersChange = calculatePercentageChange(currentUsersCount, previousUsersCount);
    const rentalsChange = calculatePercentageChange(currentRentalsCount, previousRentalsCount);
    const equipmentChange = calculatePercentageChange(currentEquipmentCount, previousEquipmentCount);
    const stripePayoutsChange = calculatePercentageChange(currentStripePayoutsCount, previousStripePayoutsCount);

    console.log("📈 Users Change:", usersChange);
    console.log("📈 Rentals Change:", rentalsChange);
    console.log("📈 Equipments Change:", equipmentChange);
    console.log("📈 Stripe Payouts Change:", stripePayoutsChange);

    const usersChangeInfo = getChangeInfo(currentUsersCount, previousUsersCount);
    const rentalsChangeInfo = getChangeInfo(currentRentalsCount, previousRentalsCount);
    const equipmentChangeInfo = getChangeInfo(currentEquipmentCount, previousEquipmentCount);
    const stripePayoutsChangeInfo = getChangeInfo(currentStripePayoutsCount, previousStripePayoutsCount);

    const summary = [
      {
        category: 'Equipments',
        count: totalEquipments,
        change: equipmentChange,
        changeDirection: equipmentChangeInfo.direction,
        changeColor: equipmentChangeInfo.color,
        month: formatMonth(previousMonth)
      },
      {
        category: 'Rentals',
        count: totalRentals,
        change: rentalsChange,
        changeDirection: rentalsChangeInfo.direction,
        changeColor: rentalsChangeInfo.color,
        month: formatMonth(previousMonth)
      },
      {
        category: 'Users',
        count: totalUsers,
        change: usersChange,
        changeDirection: usersChangeInfo.direction,
        changeColor: usersChangeInfo.color,
        month: formatMonth(previousMonth)
      },
      {
        category: 'Stripe Payouts',
        count: totalStripePayouts,
        change: stripePayoutsChange,
        changeDirection: stripePayoutsChangeInfo.direction,
        changeColor: stripePayoutsChangeInfo.color,
        month: formatMonth(previousMonth)
      },
      {
        category: 'Failed Transfers',
        count: failedStripePayouts,
        change: '0', // Failed transfers don't have monthly comparison
        changeDirection: failedStripePayouts > 0 ? 'up' : 'flat',
        changeColor: failedStripePayouts > 0 ? '#ef4444' : '#6b7280', // Red if failures exist
        month: formatMonth(previousMonth),
        alert: failedStripePayouts > 0 // Special flag for failed transfers
      }
    ];

    console.log("✅ Final Dashboard Summary:", summary);

    res.status(200).json({
      message: 'Dashboard summary retrieved successfully',
      data: summary
    });

  } catch (error) {
    console.error('❌ Error in dashboard summary:', error);
    res.status(500).json({
      message: 'Error retrieving dashboard summary',
      error: error.message
    });
  }
};
 