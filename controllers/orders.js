  const Equipments = require('../models/equipment');
  const Orders = require('../models/orders');

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

// Get Orders by Status
exports.getOrdersByStatus = async (req, res) => {
  const { status, isSeller } = req.query;

  try {
    // Dynamically get allowed statuses from the schema
    const allowedStatuses = Orders.schema.path('rental_status').enumValues;

    // Validate query parameters
    if (!status || typeof isSeller === 'undefined') {
      return res.status(400).json({
        message: "'status' and 'isSeller' query parameters are required.",
      });
    }

    // Convert status to an array using commas as the delimiter
    const statuses = status.split(',').map((s) => s.trim());

    // Check for invalid statuses
    const invalidStatuses = statuses.filter((s) => !allowedStatuses.includes(s));
    if (invalidStatuses.length > 0) {
      return res.status(400).json({
        message: "Invalid status values provided.",
        invalidStatuses,
      });
    }

    const userId = req.userId; // Extract userId from authentication middleware
    let orders;

    if (isSeller === 'true') {
      orders = await Orders.find({
        rental_status: { $in: statuses },
        'equipment_id.owner_id': userId,
      }).populate({
        path: 'equipment_id',
        select: 'name make model sub_category_fk images', // Include sub_category_fk for further population
        populate: {
          path: 'sub_category_fk',
          select: 'name category_id', // Include category_id for further population
          populate: {
            path: 'category_id',
            select: 'name', // Fetch the category name
          },
        },
      });
    } else {
      // Fetch orders for user
      orders = await Orders.find({
        rental_status: { $in: statuses },
        user_id: userId,
      }).populate({
        path: 'equipment_id',
        select: 'name make model sub_category_fk images',
        populate: {
          path: 'sub_category_fk',
          select: 'name category_id',
          populate: {
            path: 'category_id',
            select: 'name',
          },
        },
      });
    }

    // Check if orders were found
    if (!orders || orders.length === 0) {
      return res.status(200).json({
        message: "Orders fetched successfully.",
        success: true,
        orders: [],
      });
    }

    // Format orders using the utility function
    const formattedOrders = orders.map(formatOrderResponse);

    return res.status(200).json({
      message: "Orders fetched successfully.",
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    return res.status(500).json({
      message: "An error occurred while fetching orders.",
      error: error.message,
    });
  }
};

// Utility function for sending consistent order response
const formatOrderResponse = (order) => ({
  order_id: order._id,
  user_id: order.user_id,
  equipment: {
    _id: order.equipment_id._id,
    name: order.equipment_id.name,
    make: order.equipment_id.make,
    model: order.equipment_id.model,
    images: order.equipment_id.images,
    sub_category_fk: {
      _id: order.equipment_id.sub_category_fk._id,
      name: order.equipment_id.sub_category_fk.name,
    },
    category: {
      _id: order.equipment_id.sub_category_fk.category_id._id,
      name: order.equipment_id.sub_category_fk.category_id.name,
    },
  },
  rental_schedule: order.rental_schedule,
  location: order.location,
  total_amount: order.total_amount,
  security_fee: order.security_fee,
  rental_status: order.rental_status,
  return_status: order.return_status,
  cancellation: order.cancellation,
  created_at: order.created_at,
  updated_at: order.updated_at,
});


// 1) Cancel Order API
exports.cancelOrder = async (req, res) => {
  try {
    const sellerId = req.userId; // Extracted from auth middleware
    const { order_id, reason } = req.query;

    if (!order_id) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    const order = await Orders.findById(order_id).populate('equipment_id');

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.rental_status !== "Booked") {
      return res.status(400).json({ message: "Only 'Booked' orders can be canceled." });
    }

    if (String(order.equipment_id.owner_id) !== sellerId) {
      return res.status(403).json({ message: "Only the seller can cancel the order." });
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

    if (!order_id) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    const order = await Orders.findById(order_id).populate('equipment_id');

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.rental_status !== "Booked") {
      return res.status(400).json({ message: "Only 'Booked' orders can be delivered." });
    }

    if (String(order.equipment_id.owner_id) !== sellerId) {
      return res.status(403).json({ message: "Only the seller can deliver the order." });
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

    if (!order_id) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    const order = await Orders.findById(order_id);

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.user_id.toString() !== userId) {
      return res.status(403).json({ message: "Only the user can return the order." });
    }

    if (order.rental_status !== "Ongoing") {
      return res.status(400).json({ message: "Only 'Ongoing' orders can be returned." });
    }

    order.rental_status = "Returned";
    order.return_status = {
      is_returned: true,
      returned_at: new Date(),
    };
    order.updated_at = new Date();
    await order.save();

    return res.status(200).json({
      message: "Order status updated to 'Returned'.",
      status: true,
    });
  } catch (err) {
    console.error("Error returning order:", err);
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
      return res.status(403).json({ message: "Only the seller can finish the order." });
    }

    if (order.rental_status !== "Returned") {
      return res.status(400).json({ message: "Only 'Returned' orders can be finished." });
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