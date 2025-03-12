const Equipments = require('../models/equipment');
const Orders = require('../models/orders');
const cron = require('node-cron');
const mongoose = require('mongoose');
const moment = require('moment');

const timeOffsetHours = parseFloat(process.env.TIME_OFFSET_HOURS) || 3;
const intervalMinutes = parseInt(process.env.INTERVAL_MINUTES) || 1;
const DAILY_PENALTY = parseFloat(process.env.DAILY_PENALTY) || 50; // Default penalty if not set

console.log(`⏳ Monitoring every ${intervalMinutes} minute(s)`);
console.log(`⏳ Status changes after ${timeOffsetHours * 60} minutes`);

// Add Order
exports.addOrder = async (req, res) => {
  try {
    const user_id = req.userId; // Extracted from auth middleware
    const {
      equipment_id,
      start_date,
      end_date,
      delivery_address,
      address,
      lat,
      long,
      total_rent,
      security_fee,
    } = req.body;

    // Validation: Check required fields
    const requiredFields = [
      { name: 'equipment_id', value: equipment_id },
      { name: 'start_date', value: start_date },
      { name: 'end_date', value: end_date },
      { name: 'delivery_address', value: delivery_address },
      { name: 'address', value: address },
      { name: 'lat', value: lat },
      { name: 'long', value: long },
      { name: 'total_rent', value: total_rent },
      { name: 'security_fee', value: security_fee },
    ];

    for (const field of requiredFields) {
      if (!field.value) {
        return res.status(400).json({ message: `${field.name} is required.` });
      }
    }

    // Check if equipment exists
    const equipment = await Equipments.findById(equipment_id);
    if (!equipment) {
      return res.status(404).json({ message: 'Equipment not found', status: false });
    }

    // Create new order
    const newOrder = new Orders({
      user_id,
      equipment_id,
      rental_schedule: {
        start_date: new Date(start_date),
        end_date: new Date(end_date),
      },
      location: {
        address,
        lat,
        long,
      },
      total_amount: total_rent,
      security_fee: security_fee,
      cancellation: { is_cancelled: false },
      rental_status: 'Booked',
      return_status: { is_returned: false },
      penalty_apply: false,
      penalty_amount: 0,
    });

    // Save order to database
    await newOrder.save();

    return res.status(201).json({
      message: 'Order created successfully',
      status: true,
      order: {
        order_id: newOrder._id,
        user_id: newOrder.user_id,
        equipment_id: newOrder.equipment_id,
        rental_schedule: newOrder.rental_schedule,
        location: newOrder.location,
        total_amount: newOrder.total_amount,
        security_fee: newOrder.security_fee,
        rental_status: newOrder.rental_status,
        return_status: newOrder.return_status,
        created_at: newOrder.created_at,
        penalty_apply: newOrder.penalty_apply,
        penalty_amount: newOrder.penalty_amount,
      },
    });
  } catch (err) {
    console.error('Error creating order:', err);
    return res.status(500).json({ message: 'Server error', status: false });
  }
};

exports.getCurrentRentals = async (req, res) => {
  const { status, isSeller } = req.query;
  const userId = req.userId;

  try {
    const allowedStatuses = ["Booked", "Delivered", "Ongoing", "Returned", "Late", "All"];

    if (!status || typeof isSeller === "undefined") {
      return res.status(400).json({ message: "'status' and 'isSeller' query parameters are required." });
    }
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value provided." });
    }

    let statusFilter = status !== "All" ? { rental_status: status } : {};
    const matchQuery = {
      ...statusFilter,
      ...(isSeller === "true"
        ? { "equipment.owner_id": new mongoose.Types.ObjectId(userId) }
        : { user_id: new mongoose.Types.ObjectId(userId) }),
    };

    const orders = await Orders.aggregate([
      {
        $lookup: {
          from: "equipments",
          localField: "equipment_id",
          foreignField: "_id",
          as: "equipment",
        },
      },
      { $unwind: "$equipment" },
      {
        $lookup: {
          from: "sub_categories",
          localField: "equipment.sub_category_fk",
          foreignField: "_id",
          as: "subcategory",
        },
      },
      { $unwind: { path: "$subcategory", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "subcategory.category_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      { $match: matchQuery },
    ]);

    const formattedOrders = orders.map(order => {
      let statusChangeTime = "";

      // Convert timestamp if conditions match
      if (order.rental_status === "Delivered" && isSeller === "false") {
        statusChangeTime = moment(order.status_change_timestamp).format("HH:mm");
      } else if (order.rental_status === "Returned" && isSeller === "true") {
        statusChangeTime = moment(order.status_change_timestamp).format("HH:mm");
      }

      return {
        ...order,
        equipment: {
          ...order.equipment,
          average_rating: 0, // Add default average rating
        },
        penalty_apply: order.penalty_apply ?? false,
        penalty_amount: order.penalty_amount ?? 0,
        status_change_timestamp: statusChangeTime, // Converted or empty string
      };
    });

    return res.status(200).json({
      message: "Current rentals fetched successfully.",
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching current rentals.", error: error.message });
  }
};


// Get History Rentals
exports.getHistoryRentals = async (req, res) => {
  const { status, isSeller } = req.query;
  const userId = req.userId;

  try {
    const allowedStatuses = ["Cancelled", "Finished", "All"];

    if (!status || typeof isSeller === "undefined") {
      return res.status(400).json({ message: "'status' and 'isSeller' query parameters are required." });
    }
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value provided." });
    }

    let statusFilter = status !== "All" ? { rental_status: status } : {};
    const matchQuery = {
      ...statusFilter,
      ...(isSeller === "true"
        ? { "equipment.owner_id": new mongoose.Types.ObjectId(userId) }
        : { user_id: new mongoose.Types.ObjectId(userId) }),
    };

    const orders = await Orders.aggregate([
      {
        $lookup: {
          from: "equipments",
          localField: "equipment_id",
          foreignField: "_id",
          as: "equipment",
        },
      },
      { $unwind: "$equipment" },
      {
        $lookup: {
          from: "sub_categories",
          localField: "equipment.sub_category_fk",
          foreignField: "_id",
          as: "subcategory",
        },
      },
      { $unwind: { path: "$subcategory", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "subcategory.category_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      { $match: matchQuery },
    ]);

    const formattedOrders = orders.map(order => ({
      ...order,
      equipment: {
        ...order.equipment,
        average_rating: 0, // Add default average rating
      },
      penalty_apply: order.penalty_apply ?? false,
      penalty_amount: order.penalty_amount ?? 0,
    }));

    return res.status(200).json({
      message: "History rentals fetched successfully.",
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching history rentals.", error: error.message });
  }
};


// 1) Cancel Order API
exports.cancelOrder = async (req, res) => {
  try {
    const sellerId = req.userId; // Extracted from auth middleware
    const { order_id, reason } = req.query;

    if (!order_id) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    if(!reason) {
      return res.status(400).json({ message: "Cancellation Reason is required." });
    }

    const order = await Orders.findById(order_id).populate('equipment_id');

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.rental_status !== "Booked") {
      return res.status(400).json({ message: "Only 'Booked' orders can be canceled." });
    }

    if (String(order.equipment_id.owner_id) !== sellerId) {
      return res.status(403).json({ message: "Only the owner can cancel the order." });
    }

    order.cancellation = {
      is_cancelled: true,
      reason,
      cancelled_at: new Date(),
    };
    order.rental_status = "Cancelled";
    await order.save();

    return res.status(200).json({
      message: "Order canceled successfully.",
      status: true,
    });
  } catch (err) {
    console.error("Error canceling order:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// 2) Deliver Order API
exports.deliverOrder = async (req, res) => {
  try {
    const sellerId = req.userId;
    const { order_id } = req.query;
    const { images } = req.body;

    if (!order_id) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    if(!images || images.length === 0) {
      return res.status(400).json({ message: "At least one image is required." });
    };

    const order = await Orders.findById(order_id).populate('equipment_id');

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.rental_status !== "Booked") {
      return res.status(400).json({ message: "Only 'Booked' orders can be delivered." });
    }

    if (String(order.equipment_id.owner_id) !== sellerId) {
      return res.status(403).json({ message: "Only the owner can deliver the order." });
    }

    order.rental_status = "Delivered";
    order.owner_images = images;
    order.updated_at = new Date();
    await order.save();

    return res.status(200).json({
      message: "Order status updated to 'Delivered'.",
      status: true,
    });
  } catch (err) {
    console.error("Error delivering order:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

exports.collectOrder = async (req, res) => {
  try {
    const userId = req.userId;
    const { order_id } = req.query;

    if (!order_id) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    const order = await Orders.findById(order_id).populate('equipment_id');

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.rental_status !== "Delivered") {
      return res.status(400).json({ message: "Only 'Delivered' orders can be collected." });
    }

    if (String(order.user_id) !== userId) {
      return res.status(403).json({ message: "Only the user can collect the order." });
    }

    order.rental_status = "Ongoing";
    order.updated_at = new Date();
    await order.save();

    return res.status(200).json({
      message: "Order status updated to 'Ongoing'.",
      status: true,
    });
  } catch (err) {
    console.error("Error delivering order:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// 3) Return Order API
exports.returnOrder = async (req, res) => {
  try {
    const userId = req.userId;
    const { order_id } = req.query;
    const { images } = req.body;

    if (!order_id) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    if(!images || images.length === 0) {
      return res.status(400).json({ message: "At least one image is required." });
    };

    const order = await Orders.findById(order_id).populate('equipment_id');

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.rental_status !== "Ongoing") {
      return res.status(400).json({ message: "Only 'Ongoing' orders can be returned." });
    }

    if (String(order.user_id) !== userId) {
      return res.status(403).json({ message: "Only the user can return the order." });
    }

    order.rental_status = "Returned";
    order.buyer_images = images;
    order.updated_at = new Date();
    await order.save();

    return res.status(200).json({
      message: "Order status updated to 'Returned'.",
      status: true,
    });
  } catch (err) {
    console.error("Error delivering order:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// 4) Finish Order API
exports.finishOrder = async (req, res) => {
  try {
    const sellerId = req.userId;
    const { order_id } = req.query;

    if (!order_id) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    const order = await Orders.findById(order_id).populate('equipment_id');

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (String(order.equipment_id.owner_id) !== sellerId) {
      return res.status(403).json({ message: "Only the owner can finish the order." });
    }

    if (order.rental_status !== "Returned" && order.rental_status !== "Late") {
      return res.status(400).json({ message: "Only 'Returned' or 'Late' orders can be finished." });
    }     

    order.rental_status = "Finished";
    order.updated_at = new Date();
    await order.save();

    return res.status(200).json({
      message: "Order status updated to 'Finished'.",
      status: true,
    });
  } catch (err) {
    console.error("Error finishing order:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

exports.togglePenalty = async (req, res) => {
  try {
    const userId = req.userId;
    const { orderId } = req.query; // Order ID is passed as a query parameter

    // Find the order and populate equipment details in one query
    const order = await Orders.findById(orderId).populate("equipment_id");
    
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const ownerId = order.equipment_id.owner_id;

    // Ensure only the owner can toggle the penalty
    if (String(ownerId) !== String(userId)) {
      return res.status(403).json({ message: "Only the owner can toggle penalty." });
    }
    
    // Toggle penalty
    const updatedOrder = await Orders.findByIdAndUpdate(
      orderId,
      { penalty_apply: !order.penalty_apply, updated_at: new Date() },
      { new: true } // Return updated document
    );

    return res.status(200).json({
      message: `Penalty ${updatedOrder.penalty_apply ? "enabled" : "disabled"} successfully.`,
      penalty_apply: updatedOrder.penalty_apply,
    });

  } catch (error) {
    return res.status(500).json({
      message: "Error toggling penalty status.",
      error: error.message,
    });
  }
};

// Helper: Calculates future time offset
const getFutureTime = (timestamp, offsetMinutes) => {
  return moment(timestamp).add(offsetMinutes, 'minutes').toDate();
};

// Helper: Fetch the latest order from the database
const getLatestOrder = async (orderId) => {
  return await Orders.findById(orderId);
};

// Helper: Updates order safely, checking for external status changes
const updateOrder = async (order, updates) => {
  const latestOrder = await getLatestOrder(order._id);

  // If status changed externally, stop processing now but recheck in the next cycle
  if (latestOrder.rental_status !== order.rental_status) {
    console.log(`🔄 Order ${order._id} status changed externally to ${latestOrder.rental_status}. Skipping this run.`);
    return;
  }

  Object.assign(order, updates, { updated_at: new Date() });
  await order.save();
  console.log(`✅ Order ${order._id} updated:`, updates);
};

// Helper: Applies penalty if order is late
const applyLatePenalty = async (order) => {
  const now = new Date();
  const timeElapsed = now - order.status_change_timestamp;
  const daysLate = Math.floor(timeElapsed / (1000 * 60 * 60 * 24)); // Full 24-hour periods

  const expectedPenalty = (daysLate + 1) * DAILY_PENALTY; // +1 ensures penalty applies immediately

  if (order.penalty_amount !== expectedPenalty) {
    await updateOrder(order, { penalty_amount: expectedPenalty });
    console.log(`💰 Penalty updated: $${expectedPenalty}`);
  }
};

// Main process
const processOrders = async () => {
  console.log("🔍 Checking orders...");

  try {
    const now = new Date();
    const orders = await Orders.find({
      rental_status: { $in: ['Delivered', 'Returned', 'Ongoing', 'Late'] }
    });

    for (const order of orders) {
      const latestOrder = await getLatestOrder(order._id);
      if (!latestOrder) continue; // Order might have been deleted

      // If the order status changed externally, do NOT process now but recheck in the next cycle
      if (latestOrder.rental_status !== order.rental_status) {
        console.log(`⏳ Order ${order._id} status changed externally to ${latestOrder.rental_status}. Skipping for now.`);
        continue;
      }

      const futureTimestamp = getFutureTime(order.updated_at, timeOffsetHours * 60);

      // ✅ 1. Handle "Delivered" → "Ongoing"
      if (order.rental_status === 'Delivered' && now >= futureTimestamp) {
        await updateOrder(order, { rental_status: 'Ongoing' });
        console.log(`🚀 Order ${order._id} changed from Delivered → Ongoing`);
      }

      // ✅ 2. Handle "Ongoing" → "Late"
      if (order.rental_status === 'Ongoing' && now > order.rental_schedule.end_date) {
        await updateOrder(order, {
          rental_status: 'Late',
          penalty_apply: true,
          status_change_timestamp: order.rental_schedule.end_date, // First time turning Late
          penalty_amount: DAILY_PENALTY, // Immediate penalty application
        });
        console.log(`⏳ Order ${order._id} changed from Ongoing → Late!`);
      }

      // ✅ 3. Handle "Late" → Apply Daily Penalty
      if (order.rental_status === 'Late') {
        await applyLatePenalty(order);
      }

      // ✅ 4. Handle "Returned" → "Finished"
      if (order.rental_status === 'Returned' && now >= futureTimestamp) {
        await updateOrder(order, { rental_status: 'Finished' });
        console.log(`🚀 Order ${order._id} changed from Returned → Finished`);
      }
    }

    console.log("✅ Orders Monitored...");
  } catch (error) {
    console.error('❌ Error processing orders:', error);
  }
};

// Run job every hour
cron.schedule(`*/${intervalMinutes} * * * *`, processOrders);
console.log(`✅ Order monitoring started.`);