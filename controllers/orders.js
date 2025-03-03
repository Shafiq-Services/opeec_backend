  const Equipments = require('../models/equipment');
  const Orders = require('../models/orders');
  const cron = require('node-cron');
  const mongoose = require('mongoose');

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
      return res.status(404).json({
        message: 'Equipment not found',
        status: false,
      });
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
      cancellation: {
        is_cancelled: false,
      },
      rental_status: 'Booked',
      return_status: {
        is_returned: false,
      },
    });

    // Save order to database
    await newOrder.save();

    // Response with order details
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
      },
    });
  } catch (err) {
    console.error('Error creating order:', err);
    return res.status(500).json({
      message: 'Server error',
      status: false,
    });
  }
};

exports.getCurrentRentals = async (req, res) => {
  const { status, isSeller } = req.query;
  const userId = req.userId;

  try {
    const allowedStatuses = ["Booked", "Delivered", "Ongoing", "Returned", "Late", "All"];

    // Validate query parameters
    if (!status || typeof isSeller === "undefined") {
      return res.status(400).json({
        message: "'status' and 'isSeller' query parameters are required.",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status value provided.",
      });
    }

    let statusFilter = {};
    if (status !== "All") {
      statusFilter.rental_status = status;
    } else {
      statusFilter.rental_status = { $in: allowedStatuses.filter((s) => s !== "All") };
    }

    // Build match criteria depending on the caller type.
    const matchQuery = {
      ...statusFilter,
      ...(isSeller === "true"
        ? { "equipment.owner_id": new mongoose.Types.ObjectId(userId) }
        : { user_id: new mongoose.Types.ObjectId(userId) }
      ),
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
      {
        $match: matchQuery,
      },
    ]);

    const formattedOrders = orders.map((order) => ({
      _id: order._id,
      user_id: order.user_id,
      rental_schedule: order.rental_schedule,
      location: order.location,
      cancellation: order.cancellation,
      return_status: order.return_status,
      equipment_id: {
        _id: order.equipment._id,
        name: order.equipment.name,
        make: order.equipment.make,
        model: order.equipment.model,
        address: order.equipment.custom_location?.address || null,
        images: order.equipment.images,
        owner_id: order.equipment.owner_id,
        category_id: order.category?._id?.toString() || "",
        category_name: order.category?.name || "",
        subcategory_id: order.subcategory?._id?.toString() || "",
        subcategory_name: order.subcategory?.name || "",
      },
      security_fee: order.security_fee,
      total_amount: order.total_amount,
      owner_images: order.owner_images,
      buyer_images: order.buyer_images,
      rental_status: order.rental_status,
      expiry_at: new Date(order.updated_at.getTime() + 3 * 60 * 60 * 1000),
      created_at: order.created_at,
      updated_at: order.updated_at,
      __v: order.__v,
    }));

    return res.status(200).json({
      message: "Current rentals fetched successfully.",
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    return res.status(500).json({
      message: "An error occurred while fetching current rentals.",
      error: error.message,
    });
  }
};


exports.getHistoryRentals = async (req, res) => {
  const { status, isSeller } = req.query;
  const userId = req.userId;

  try {
    const allowedStatuses = ["Cancelled", "Finished", "All"];

    // Validate query parameters
    if (!status || typeof isSeller === "undefined") {
      return res.status(400).json({
        message: "'status' and 'isSeller' query parameters are required.",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status value provided.",
      });
    }

    // Build status filter
    let statusFilter = {};
    if (status !== "All") {
      statusFilter.rental_status = status;
    } else {
      statusFilter.rental_status = { $in: allowedStatuses.filter((s) => s !== "All") };
    }

    // Build match criteria based on the caller type
    const matchQuery = {
      ...statusFilter,
      ...(isSeller === "true"
        ? { "equipment.owner_id": new mongoose.Types.ObjectId(userId) }
        : { user_id: new mongoose.Types.ObjectId(userId) }
      ),
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
      {
        $match: matchQuery,
      },
    ]);

    // Format response as per required structure
    const formattedOrders = orders.map((order) => ({
      _id: order._id,
      user_id: order.user_id,
      rental_schedule: order.rental_schedule,
      location: order.location,
      cancellation: order.cancellation,
      return_status: order.return_status,
      equipment_id: {
        _id: order.equipment._id,
        name: order.equipment.name,
        make: order.equipment.make,
        model: order.equipment.model,
        address: order.equipment.custom_location?.address || null,
        images: order.equipment.images,
        owner_id: order.equipment.owner_id,
        category_id: order.category?._id?.toString() || "",
        category_name: order.category?.name || "",
        subcategory_id: order.subcategory?._id?.toString() || "",
        subcategory_name: order.subcategory?.name || "",
      },
      owner_images: order.owner_images,
      buyer_images: order.buyer_images,
      security_fee: order.security_fee,
      total_amount: order.total_amount,
      rental_status: order.rental_status,
      expiry_at: new Date(order.updated_at.getTime() + 3 * 60 * 60 * 1000),
      created_at: order.created_at,
      updated_at: order.updated_at,
      __v: order.__v,
    }));

    return res.status(200).json({
      message: "History rentals fetched successfully.",
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    return res.status(500).json({
      message: "An error occurred while fetching history rentals.",
      error: error.message,
    });
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

    if (order.rental_status !== "Returned" || order.rental_status !== "Late") {
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



/**
 * 1️⃣ Auto-Update: Change Ongoing → Late if End Date Passed
 */
const markLateOrders = async () => {
  try {
    const now = new Date();

    const updatedOrders = await Orders.updateMany(
      { 'rental_schedule.end_date': { $lt: now }, rental_status: 'Ongoing' },
      { $set: { rental_status: 'Late', updated_at: now } }
    );

    console.log(`Updated ${updatedOrders.modifiedCount} orders to Late`);
  } catch (error) {
    console.error('Error updating Late orders:', error);
  }
};

/**
 * 2️⃣ Auto-Update: Change Delivered → Ongoing After 3 Hours
 */
const updateDeliveredToOngoing = async () => {
  try {
    const threeHoursAgo = moment().subtract(3, 'hours').toDate();

    const updatedOrders = await Orders.updateMany(
      { rental_status: 'Delivered', updated_at: { $lte: threeHoursAgo } },
      { $set: { rental_status: 'Ongoing', updated_at: new Date() } }
    );

    console.log(`Updated ${updatedOrders.modifiedCount} Delivered orders to Ongoing`);
  } catch (error) {
    console.error('Error updating Delivered to Ongoing:', error);
  }
};

/**
 * 3️⃣ Auto-Update: Change Returned → Finished After 3 Hours
 */
const updateReturnedToFinished = async () => {
  try {
    const threeHoursAgo = moment().subtract(3, 'hours').toDate();

    const updatedOrders = await Orders.updateMany(
      { rental_status: 'Returned', updated_at: { $lte: threeHoursAgo } },
      { $set: { rental_status: 'Finished', updated_at: new Date() } }
    );

    console.log(`Updated ${updatedOrders.modifiedCount} Returned orders to Finished`);
  } catch (error) {
    console.error('Error updating Returned to Finished:', error);
  }
};

/**
 * 🕒 **Cron Job**: Run every 10 minutes to update order statuses
 */
cron.schedule('*/10 * * * *', () => { // Runs every 10 minutes
  console.log('Running scheduled tasks...');
  markLateOrders();
  updateDeliveredToOngoing();
  updateReturnedToFinished();
});