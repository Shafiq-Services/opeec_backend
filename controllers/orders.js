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
    const user_id = req.userId;
    const {
      equipment_id,
      start_date,
      end_date,
      address,
      lat,
      long,
      rental_fee,
      platform_fee,
      tax_amount,
      total_amount,
      is_insurance,
      insurance_amount,
      deposit_amount
    } = req.body;

    // Validation: Required fields
    const requiredFields = [
      { name: 'equipment_id', value: equipment_id },
      { name: 'start_date', value: start_date },
      { name: 'end_date', value: end_date },
      { name: 'address', value: address },
      { name: 'lat', value: lat },
      { name: 'long', value: long },
      { name: 'rental_fee', value: rental_fee },
      { name: 'platform_fee', value: platform_fee },
      { name: 'tax_amount', value: tax_amount },
      { name: 'total_amount', value: total_amount },
      { name: 'is_insurance', value: is_insurance }
    ];

    for (const field of requiredFields) {
      if (field.value === undefined || field.value === null) {
        return res.status(400).json({ message: `${field.name} is required.` });
      }
    }

    // Validate equipment existence
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
        long
      },
      rental_fee,
      platform_fee,
      tax_amount,
      total_amount,
      security_option: {
        insurance: is_insurance,
        insurance_amount: is_insurance ? insurance_amount : 0,
        deposit_amount: !is_insurance ? deposit_amount : 0
      },
      cancellation: { is_cancelled: false },
      rental_status: 'Booked',
      return_status: { is_returned: false },
      penalty_apply: true,
      penalty_amount: 0,
      status_change_timestamp: new Date()
    });

    await newOrder.save();

    return res.status(201).json({
      message: 'Order created successfully',
      status: true,
      order: newOrder
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
      return res.status(400).json({
        message: "'status' and 'isSeller' query parameters are required.",
      });
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

      if (order.rental_status === "Delivered" && isSeller === "false") {
        statusChangeTime = moment.utc(order.status_change_timestamp).format("HH:mm");
      } else if (order.rental_status === "Returned" && isSeller === "true") {
        statusChangeTime = moment.utc(order.status_change_timestamp).format("HH:mm");
      }

      return {
        ...order,
        equipment: {
          ...order.equipment,
          average_rating: order.equipment.average_rating || 0,
        },
        penalty_apply: order.penalty_apply ?? false,
        penalty_amount: order.penalty_amount ?? 0,
        status_change_timestamp: statusChangeTime,
        rental_days: order.rental_days ?? 0,
        subtotal: order.subtotal ?? order.rental_fee + (order.insurance_amount || 0),
        total_amount: order.total_amount ?? order.rental_fee + order.platform_fee + order.tax_amount + (order.insurance_amount || 0),
      };
    });

    return res.status(200).json({
      message: "Current rentals fetched successfully.",
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching current rentals.",
      error: error.message,
    });
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
        average_rating: order.equipment.average_rating || 0,
      },
      penalty_apply: order.penalty_apply ?? false,
      penalty_amount: order.penalty_amount ?? 0,
      rental_days: order.rental_days ?? 0,
      subtotal: order.subtotal ?? order.rental_fee + (order.insurance_amount || 0),
      total_amount: order.total_amount ?? order.rental_fee + order.platform_fee + order.tax_amount + (order.insurance_amount || 0),
    }));

    return res.status(200).json({
      message: "History rentals fetched successfully.",
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching history rentals.",
      error: error.message,
    });
  }
};



//Cancel Order API
exports.cancelOrder = async (req, res) => {
  try {
    const sellerId = req.userId;
    const { order_id, reason } = req.query;

    if (!order_id || !mongoose.Types.ObjectId.isValid(order_id)) {
      return res.status(400).json({ message: "Valid order ID is required." });
    }

    if (!reason || reason.trim() === "") {
      return res.status(400).json({ message: "Cancellation reason is required." });
    }

    const order = await Orders.findById(order_id).populate('equipment_id');

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.rental_status !== "Booked") {
      return res.status(400).json({ message: "Only 'Booked' orders can be canceled." });
    }

    // ✅ Optional: Enforce that only the equipment owner can cancel
    if (String(order.equipment_id.owner_id) !== sellerId) {
      return res.status(403).json({ message: "Only the owner can cancel this order." });
    }

    order.cancellation = {
      is_cancelled: true,
      reason: reason.trim(),
      cancelled_at: new Date(),
    };
    order.rental_status = "Cancelled";
    await order.save();

    return res.status(200).json({
      message: "Order canceled successfully.",
      status: true,
      order_id: order._id,
      rental_status: order.rental_status,
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

    if (!order_id || !mongoose.Types.ObjectId.isValid(order_id)) {
      return res.status(400).json({ message: "Valid Order ID is required." });
    }

    if (!images || images.length === 0) {
      return res.status(400).json({ message: "At least one image is required." });
    }

    const order = await Orders.findById(order_id).populate("equipment_id");
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.rental_status !== "Booked") return res.status(400).json({ message: "Only 'Booked' orders can be delivered." });
    if (String(order.equipment_id.owner_id) !== sellerId) return res.status(403).json({ message: "Only the owner can deliver the order." });

    order.rental_status = "Delivered";
    order.owner_images = images;
    order.updated_at = new Date();

    order.status_change_timestamp = new Date(); // For tracking

    const equipment = await Equipments.findById(order.equipment_id);
    equipment.equipment_status = "InActive";
    await equipment.save();
    await order.save();

    return res.status(200).json({ message: "Order status updated to 'Delivered'.", status: true });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

exports.collectOrder = async (req, res) => {
  try {
    const userId = req.userId;
    const { order_id } = req.query;

    if (!order_id || !mongoose.Types.ObjectId.isValid(order_id)) {
      return res.status(400).json({ message: "Valid Order ID is required." });
    }

    const order = await Orders.findById(order_id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.rental_status !== "Delivered") return res.status(400).json({ message: "Only 'Delivered' orders can be collected." });
    if (String(order.user_id) !== userId) return res.status(403).json({ message: "Only the user can collect the order." });

    order.rental_status = "Ongoing";
    order.updated_at = new Date();
    order.status_change_timestamp = new Date();
    await order.save();

    return res.status(200).json({ message: "Order status updated to 'Ongoing'.", status: true });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

exports.returnOrder = async (req, res) => {
  try {
    const userId = req.userId;
    const { order_id } = req.query;
    const { images } = req.body;

    if (!order_id || !mongoose.Types.ObjectId.isValid(order_id)) {
      return res.status(400).json({ message: "Valid Order ID is required." });
    }

    if (!images || images.length === 0) {
      return res.status(400).json({ message: "At least one image is required." });
    }

    const order = await Orders.findById(order_id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.rental_status !== "Ongoing") return res.status(400).json({ message: "Only 'Ongoing' orders can be returned." });
    if (String(order.user_id) !== userId) return res.status(403).json({ message: "Only the user can return the order." });

    order.rental_status = "Returned";
    order.buyer_images = images;
    order.updated_at = new Date();
    order.status_change_timestamp = new Date();
    await order.save();

    return res.status(200).json({ message: "Order status updated to 'Returned'.", status: true });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

exports.finishOrder = async (req, res) => {
  try {
    const sellerId = req.userId;
    const { order_id } = req.query;

    if (!order_id || !mongoose.Types.ObjectId.isValid(order_id)) {
      return res.status(400).json({ message: "Valid Order ID is required." });
    }

    const order = await Orders.findById(order_id).populate("equipment_id");
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (String(order.equipment_id.owner_id) !== sellerId) return res.status(403).json({ message: "Only the owner can finish the order." });
    if (!["Returned", "Late"].includes(order.rental_status)) {
      return res.status(400).json({ message: "Only 'Returned' or 'Late' orders can be finished." });
    }

    order.rental_status = "Finished";
    order.updated_at = new Date();
    order.status_change_timestamp = new Date();

    const equipment = await Equipments.findById(order.equipment_id);
    equipment.equipment_status = "Active";
    await equipment.save();
    await order.save();

    return res.status(200).json({ message: "Order status updated to 'Finished'.", status: true });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

exports.togglePenalty = async (req, res) => {
  try {
    const userId = req.userId;
    const { orderId } = req.query;

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Valid orderId is required." });
    }

    const order = await Orders.findById(orderId).populate("equipment_id");
    if (!order) return res.status(404).json({ message: "Order not found." });

    if (String(order.equipment_id.owner_id) !== String(userId)) {
      return res.status(403).json({ message: "Only the owner can toggle penalty." });
    }

    order.penalty_apply = !order.penalty_apply;
    order.updated_at = new Date();
    await order.save();

    return res.status(200).json({
      message: `Penalty ${order.penalty_apply ? "enabled" : "disabled"} successfully.`,
      penalty_apply: order.penalty_apply,
    });
  } catch (error) {
    return res.status(500).json({ message: "Error toggling penalty status.", error: error.message });
  }
};

exports.addBuyerReview = async (req, res) => {
  const { rating, comment } = req.body;
  const { orderId } = req.query;

  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    return res.status(400).json({ message: "Valid orderId is required." });
  }

  if (rating === undefined || rating === null) {
    return res.status(400).json({ message: "Rating is required." });
  }

  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Rating must be a number between 1 and 5." });
  }

  if (comment && typeof comment !== "string") {
    return res.status(400).json({ message: "Comment must be a string." });
  }

  try {
    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found." });

    order.buyer_review = {
      rating,
      comment: comment || "",
    };

    order.updated_at = new Date();
    await order.save();

    return res.status(200).json({
      message: "Buyer review added successfully.",
      success: true,
      order,
    });
  } catch (error) {
    return res.status(500).json({ message: "Error adding buyer review.", error: error.message });
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

  if (latestOrder.rental_status !== order.rental_status) {
    console.log(`🔄 Order ${order._id} status changed externally to ${latestOrder.rental_status}. Skipping this run.`);
    return;
  }

  const requiredFields = {
    rental_fee: order.rental_fee ?? latestOrder.rental_fee ?? 0,
    platform_fee: order.platform_fee ?? latestOrder.platform_fee ?? 0,
    tax_amount: order.tax_amount ?? latestOrder.tax_amount ?? 0,
    total_amount: order.total_amount ?? latestOrder.total_amount ?? 0,
    insurance_amount: order.insurance_amount ?? latestOrder.insurance_amount ?? 0,
    deposit_amount: order.deposit_amount ?? latestOrder.deposit_amount ?? 0,
  };

  Object.assign(order, updates, requiredFields, { updated_at: new Date() });

  try {
    await order.save();
    console.log(`✅ Order ${order._id} updated:`, updates);
  } catch (error) {
    console.error(`❌ Failed to save Order ${order._id}:`, error.message);
  }
};


// Helper: Applies penalty if order is late
const applyLatePenalty = async (order) => {
  const now = new Date();
  const timeElapsed = now - order.status_change_timestamp;
  const daysLate = Math.floor(timeElapsed / (1000 * 60 * 60 * 24));

  const expectedPenalty = (daysLate + 1) * DAILY_PENALTY;

  if (order.penalty_amount !== expectedPenalty) {
    await updateOrder(order, { penalty_amount: expectedPenalty });
    console.log(`💰 Penalty updated: $${expectedPenalty}`);
  }
};

const processOrders = async () => {
  console.log("🔍 Checking orders...");

  try {
    const now = new Date();
    const orders = await Orders.find({
      rental_status: { $in: ['Delivered', 'Returned', 'Ongoing', 'Late'] }
    });

    for (const order of orders) {
      const latestOrder = await getLatestOrder(order._id);
      if (!latestOrder) continue;

      if (latestOrder.rental_status !== order.rental_status) {
        console.log(`⏳ Order ${order._id} status changed externally to ${latestOrder.rental_status}. Skipping for now.`);
        continue;
      }

      const futureTimestamp = getFutureTime(order.updated_at, timeOffsetHours * 60);

      if (order.rental_status === 'Delivered' && now >= futureTimestamp) {
        await updateOrder(order, {
          rental_status: 'Ongoing',
          status_change_timestamp: new Date()
        });
        console.log(`🚀 Order ${order._id} changed from Delivered → Ongoing`);
      }

      if (order.rental_status === 'Ongoing' && order.rental_schedule?.end_date && now > order.rental_schedule.end_date) {
        await updateOrder(order, {
          rental_status: 'Late',
          penalty_apply: true,
          status_change_timestamp: order.rental_schedule.end_date,
          penalty_amount: DAILY_PENALTY
        });
        console.log(`⏳ Order ${order._id} changed from Ongoing → Late!`);
      }

      if (order.rental_status === 'Late') {
        await applyLatePenalty(order);
      }

      if (order.rental_status === 'Returned' && now >= futureTimestamp) {
        await updateOrder(order, {
          rental_status: 'Finished',
          status_change_timestamp: new Date()
        });
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

// Admin: Get rentals by status
exports.getRentalsByStatus = async (req, res) => {
  try {
    const { status = 'All' } = req.query;
    const allowedStatuses = ["Booked", "Delivered", "Ongoing", "Returned", "Late", "All"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value provided." });
    }

    let statusFilter = status !== "All" ? { rental_status: status } : {};

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
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      { $match: statusFilter },
      {
        $project: {
          _id: 1,
          rental_status: 1,
          rental_fee: 1,
          platform_fee: 1,
          tax_amount: 1,
          total_amount: 1,
          penalty_amount: 1,
          created_at: 1,
          "rental_schedule.start_date": 1,
          "rental_schedule.end_date": 1,
          "location.address": 1,
          "equipment.name": 1,
          "equipment.owner_id": 1,
          "equipment.images": 1,
          "category.name": 1,
          "subcategory.name": 1,
          "user.name": 1,
          "user.email": 1,
          "user.phone_number": 1
        }
      }
    ]);

    const formattedOrders = orders.map(order => ({
      _id: order._id,
      rental_status: order.rental_status,
      rental_fee: order.rental_fee,
      platform_fee: order.platform_fee,
      tax_amount: order.tax_amount,
      total_amount: order.total_amount,
      penalty_amount: order.penalty_amount || 0,
      created_at: order.created_at,
      start_date: order.rental_schedule?.start_date,
      end_date: order.rental_schedule?.end_date,
      address: order.location?.address,
      equipment: {
        name: order.equipment?.name,
        owner_id: order.equipment?.owner_id,
        images: order.equipment?.images
      },
      category: order.category?.name,
      subcategory: order.subcategory?.name,
      user: {
        name: order.user?.name,
        email: order.user?.email,
        phone_number: order.user?.phone_number
      }
    }));

    return res.status(200).json({
      message: "Rentals fetched successfully.",
      success: true,
      orders: formattedOrders,
      total_count: formattedOrders.length
    });
  } catch (error) {
    console.error('Error fetching rentals by status:', error);
    return res.status(500).json({
      message: "Error fetching rentals by status.",
      error: error.message,
    });
  }
};
