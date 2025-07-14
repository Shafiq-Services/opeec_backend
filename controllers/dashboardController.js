const User = require('../models/user');
const Order = require('../models/orders');
const Equipment = require('../models/equipment');
const mongoose = require('mongoose');

// Get dashboard summary with month-over-month changes
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
      created_at: { $gte: currentMonth, $lt: now }
    });
    const previousUsersCount = await User.countDocuments({
      created_at: { $gte: previousMonth, $lt: previousMonthEnd }
    });

    console.log("👥 Users - Current Month:", currentUsersCount);
    console.log("👥 Users - Previous Month:", previousUsersCount);

    const currentRentalsCount = await Order.countDocuments({
      created_at: { $gte: currentMonth, $lt: now }
    });
    const previousRentalsCount = await Order.countDocuments({
      created_at: { $gte: previousMonth, $lt: previousMonthEnd }
    });

    console.log("📦 Rentals - Current Month:", currentRentalsCount);
    console.log("📦 Rentals - Previous Month:", previousRentalsCount);

    const currentEquipmentCount = await Equipment.countDocuments({
      equipment_status: 'Active',
      _id: {
        $gte: new mongoose.Types.ObjectId(Math.floor(currentMonth.getTime() / 1000).toString(16) + '0000000000000000'),
        $lt: new mongoose.Types.ObjectId(Math.floor(now.getTime() / 1000).toString(16) + '0000000000000000')
      }
    });

    const previousEquipmentCount = await Equipment.countDocuments({
      equipment_status: 'Active',
      _id: {
        $gte: new mongoose.Types.ObjectId(Math.floor(previousMonth.getTime() / 1000).toString(16) + '0000000000000000'),
        $lt: new mongoose.Types.ObjectId(Math.floor(previousMonthEnd.getTime() / 1000).toString(16) + '0000000000000000')
      }
    });

    console.log("🛠️ Equipments - Current Month:", currentEquipmentCount);
    console.log("🛠️ Equipments - Previous Month:", previousEquipmentCount);

    // Total counts
    const totalUsers = await User.countDocuments();
    const totalRentals = await Order.countDocuments();
    const totalEquipments = await Equipment.countDocuments({ equipment_status: 'Active' });

    console.log("📊 Total Users:", totalUsers);
    console.log("📊 Total Rentals:", totalRentals);
    console.log("📊 Total Active Equipments:", totalEquipments);

    // Percentage changes
    const usersChange = calculatePercentageChange(currentUsersCount, previousUsersCount);
    const rentalsChange = calculatePercentageChange(currentRentalsCount, previousRentalsCount);
    const equipmentChange = calculatePercentageChange(currentEquipmentCount, previousEquipmentCount);

    console.log("📈 Users Change:", usersChange);
    console.log("📈 Rentals Change:", rentalsChange);
    console.log("📈 Equipments Change:", equipmentChange);

    const usersChangeInfo = getChangeInfo(currentUsersCount, previousUsersCount);
    const rentalsChangeInfo = getChangeInfo(currentRentalsCount, previousRentalsCount);
    const equipmentChangeInfo = getChangeInfo(currentEquipmentCount, previousEquipmentCount);

    const summary = [
      {
        category: 'Users',
        count: totalUsers,
        change: usersChange,
        changeDirection: usersChangeInfo.direction,
        changeColor: usersChangeInfo.color,
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
        category: 'Equipments',
        count: totalEquipments,
        change: equipmentChange,
        changeDirection: equipmentChangeInfo.direction,
        changeColor: equipmentChangeInfo.color,
        month: formatMonth(previousMonth)
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
 