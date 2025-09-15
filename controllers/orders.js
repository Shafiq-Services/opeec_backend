const Equipment = require('../models/equipment');
const Order = require('../models/orders');
const Category = require('../models/categories');
const cron = require('node-cron');
const mongoose = require('mongoose');
const moment = require('moment');
const { calculateOrderFees } = require('../utils/feeCalculations');
const { createAdminNotification } = require('./adminNotificationController');
const User = require('../models/user');

// Helper function to create subcategory lookup pipeline for embedded subcategories
function createSubcategoryLookupPipeline() {
  return [
    {
      $lookup: {
        from: "categories",
        let: { subCatId: "$equipment.subCategoryId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ["$$subCatId", "$sub_categories._id"]
              }
            }
          },
          {
            $project: {
              _id: 1,
              name: 1,
              category_image: 1,
              subcategory: {
                $filter: {
                  input: "$sub_categories",
                  cond: { $eq: ["$$this._id", "$$subCatId"] }
                }
              }
            }
          },
          {
            $unwind: "$subcategory"
          }
        ],
        as: "categoryWithSubcategory"
      }
    },
    { $unwind: { path: "$categoryWithSubcategory", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        category: {
          _id: "$categoryWithSubcategory._id",
          name: "$categoryWithSubcategory.name",
          category_image: "$categoryWithSubcategory.category_image"
        },
        subcategory: {
          _id: "$categoryWithSubcategory.subcategory._id",
          name: "$categoryWithSubcategory.subcategory.name",
          security_fee: "$categoryWithSubcategory.subcategory.security_fee"
        }
      }
    },
    {
      $project: {
        categoryWithSubcategory: 0
      }
    }
  ];
}

const timeOffsetHours = parseFloat(process.env.TIME_OFFSET_HOURS) || 3;
const intervalMinutes = parseInt(process.env.INTERVAL_MINUTES) || 1;
const DAILY_PENALTY = parseFloat(process.env.DAILY_PENALTY) || 50; // Default penalty if not set

console.log(`⏳ Monitoring every ${intervalMinutes} minute(s)`);
console.log(`⏳ Status changes after ${timeOffsetHours * 60} minutes`);

// Add Order
exports.addOrder = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      equipmentId,
      start_date,
      end_date,
      address,
      lat,
      lng,
      rental_fee,
      platform_fee,
      tax_amount,
      insurance_amount,
      deposit_amount,
      total_amount,
      subtotal,
      is_insurance
    } = req.body;

    // Validation: Required fields
    const requiredFields = [
      { name: 'equipmentId', value: equipmentId },
      { name: 'start_date', value: start_date },
      { name: 'end_date', value: end_date },
      { name: 'address', value: address },
      { name: 'lat', value: lat },
      { name: 'lng', value: lng },
      { name: 'rental_fee', value: rental_fee },
      { name: 'platform_fee', value: platform_fee },
      { name: 'tax_amount', value: tax_amount },
      { name: 'total_amount', value: total_amount },
      { name: 'subtotal', value: subtotal },
      { name: 'is_insurance', value: is_insurance }
    ];

    for (const field of requiredFields) {
      if (field.value === undefined || field.value === null) {
        return res.status(400).json({ message: `${field.name} is required.` });
      }
    }

    // Validate equipment existence
    const equipment = await Equipment.findById(equipmentId);
    if (!equipment) return res.status(404).json({ message: 'Equipment not found.' });

    // Backend validation: Verify pricing calculations match expected values
    try {
      const { calculateOrderFees } = require('../utils/feeCalculations');
      const rentalDays = Math.ceil((new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)) || 1;
      const expectedFees = await calculateOrderFees(rental_fee, is_insurance, rentalDays);
      
      // Allow small rounding differences (±$0.05)
      const tolerance = 0.05;
      const providedFees = { platform_fee, tax_amount, total_amount, subtotal };
      const feesToValidate = ['platform_fee', 'tax_amount', 'total_amount', 'subtotal'];
      
      for (const fee of feesToValidate) {
        const expected = expectedFees[fee];
        const provided = providedFees[fee];
        
        if (Math.abs(expected - provided) > tolerance) {
          console.warn(`⚠️ Pricing validation failed for ${fee}: expected ${expected}, got ${provided}`);
          return res.status(400).json({ 
            message: `Invalid pricing calculation for ${fee}. Expected: $${expected}, provided: $${provided}` 
          });
        }
      }
    } catch (validationError) {
      console.error('Pricing validation error:', validationError);
      // Continue with order creation if validation fails (non-blocking for now)
    }

    // Create new order with all pricing data from frontend
    const newOrder = new Order({
      userId,
      equipmentId,
      rental_schedule: { start_date, end_date },
      location: { address, lat, lng },
      rental_fee,
      platform_fee,
      tax_amount,
      insurance_amount: is_insurance ? insurance_amount : 0,
      deposit_amount: is_insurance ? 0 : deposit_amount,
      total_amount,
      subtotal,
      security_option: {
        insurance: is_insurance
      }
    });

    const savedOrder = await newOrder.save();

    // Get user and equipment details for notification
    const user = await User.findById(userId).select('name email');
    
    // Send admin notification for new rental booking
    await createAdminNotification(
      'rental_booking',
      `New rental booking for "${equipment.name}" by ${user.name}`,
      {
        userId: userId,
        equipmentId: equipmentId,
        orderId: savedOrder._id,
        data: {
          userName: user.name,
          userEmail: user.email,
          equipmentName: equipment.name,
          equipmentOwner: equipment.ownerId,
          startDate: start_date,
          endDate: end_date,
          rentalFee: rental_fee,
          bookingDate: new Date()
        }
      }
    );
    
    // Return saved order with all pricing data
    res.status(201).json({ 
      message: 'Order created successfully.', 
      data: savedOrder.toObject()
    });

  } catch (err) {
    console.error('Error creating order:', err);
    return res.status(500).json({ message: 'Server error', status: false });
  }
};


// Get Current Rentals
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
        ? { "equipment.ownerId": new mongoose.Types.ObjectId(userId) }
        : { userId: new mongoose.Types.ObjectId(userId) }),
    };

    const orders = await Order.aggregate([
      {
        $lookup: {
          from: "equipments",
          localField: "equipmentId",
          foreignField: "_id",
          as: "equipment",
        },
      },
      { $unwind: "$equipment" },
      ...createSubcategoryLookupPipeline(),
      { $match: matchQuery },
    ]);

    const formattedOrders = orders.map(order => {
      let statusChangeTime = "";

      if (order.rental_status === "Delivered" && isSeller === "false") {
        statusChangeTime = moment.utc(order.status_change_timestamp).format("HH:mm");
      } else if (order.rental_status === "Returned" && isSeller === "true") {
        statusChangeTime = moment.utc(order.status_change_timestamp).format("HH:mm");
      }

      // Remove sub_categories from category if it exists
      const cleanedOrder = { ...order };
      if (cleanedOrder.category && cleanedOrder.category.sub_categories) {
        const { sub_categories, ...categoryWithoutSubCategories } = cleanedOrder.category;
        cleanedOrder.category = categoryWithoutSubCategories;
      }

      return {
        ...cleanedOrder,
        equipment: {
          ...order.equipment,
          average_rating: order.equipment.average_rating || 0,
        },
        penalty_apply: order.penalty_apply ?? false,
        penalty_amount: order.penalty_amount ?? 0,
        status_change_timestamp: statusChangeTime,
        rental_days: order.rental_days ?? 0,
        // Use stored pricing data directly (no more calculations needed)
        platform_fee: order.platform_fee,
        tax_amount: order.tax_amount,
        insurance_amount: order.insurance_amount,
        deposit_amount: order.deposit_amount,
        subtotal: order.subtotal,
        total_amount: order.total_amount,
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
        ? { "equipment.ownerId": new mongoose.Types.ObjectId(userId) }
        : { userId: new mongoose.Types.ObjectId(userId) }),
    };

    const orders = await Order.aggregate([
      {
        $lookup: {
          from: "equipments",
          localField: "equipmentId",
          foreignField: "_id",
          as: "equipment",
        },
      },
      { $unwind: "$equipment" },
      ...createSubcategoryLookupPipeline(),
      { $match: matchQuery },
    ]);

    const formattedOrders = orders.map(order => {
      let statusChangeTime = "";

      if (order.rental_status === "Delivered" && isSeller === "false") {
        statusChangeTime = moment.utc(order.status_change_timestamp).format("HH:mm");
      } else if (order.rental_status === "Returned" && isSeller === "true") {
        statusChangeTime = moment.utc(order.status_change_timestamp).format("HH:mm");
      }

      // Remove sub_categories from category if it exists
      const cleanedOrder = { ...order };
      if (cleanedOrder.category && cleanedOrder.category.sub_categories) {
        const { sub_categories, ...categoryWithoutSubCategories } = cleanedOrder.category;
        cleanedOrder.category = categoryWithoutSubCategories;
      }

      return {
        ...cleanedOrder,
        equipment: {
          ...order.equipment,
          average_rating: order.equipment.average_rating || 0,
        },
        penalty_apply: order.penalty_apply ?? false,
        penalty_amount: order.penalty_amount ?? 0,
        status_change_timestamp: statusChangeTime,
        rental_days: order.rental_days ?? 0,
        // Use stored pricing data directly (no more calculations needed)
        platform_fee: order.platform_fee,
        tax_amount: order.tax_amount,
        insurance_amount: order.insurance_amount,
        deposit_amount: order.deposit_amount,
        subtotal: order.subtotal,
        total_amount: order.total_amount,
      };
    });

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

    const order = await Order.findById(order_id).populate('equipmentId');

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.rental_status !== "Booked") {
      return res.status(400).json({ message: "Only 'Booked' orders can be canceled." });
    }

    // ✅ Optional: Enforce that only the equipment owner can cancel
    if (String(order.equipmentId.ownerId) !== sellerId) {
      return res.status(403).json({ message: "Only the owner can cancel this order." });
    }

    order.cancellation = {
      is_cancelled: true,
      reason: reason.trim(),
      cancelled_at: new Date(),
    };
    order.rental_status = "Cancelled";
    await order.save();

    // Process settlement for cancelled order
    try {
      const currentTime = new Date();
      const startDate = new Date(order.rental_schedule.start_date);
      const isBeforeCutoff = currentTime < startDate;
      
      await processOrderCancellation(order._id, isBeforeCutoff);
      console.log(`💰 Settlement processed for cancelled order: ${order._id}`);
    } catch (settlementError) {
      console.error(`❌ Settlement error for cancelled order ${order._id}:`, settlementError);
      // Continue with order cancellation even if settlement fails
    }

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

    const order = await Order.findById(order_id).populate("equipmentId");
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.rental_status !== "Booked") return res.status(400).json({ message: "Only 'Booked' orders can be delivered." });
    if (String(order.equipmentId.ownerId) !== sellerId) return res.status(403).json({ message: "Only the owner can deliver the order." });

    order.rental_status = "Delivered";
    order.owner_images = images;
    order.updated_at = new Date();

    order.status_change_timestamp = new Date(); // For tracking

    const equipment = await Equipment.findById(order.equipmentId);
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

    const order = await Order.findById(order_id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.rental_status !== "Delivered") return res.status(400).json({ message: "Only 'Delivered' orders can be collected." });
    if (String(order.userId) !== userId) return res.status(403).json({ message: "Only the user can collect the order." });

    // ✅ Check if required time has passed since delivery
    const deliveryTime = order.status_change_timestamp;
    const now = new Date();
    const hoursElapsed = (now - deliveryTime) / (1000 * 60 * 60);
    const requiredHours = timeOffsetHours;

    if (hoursElapsed < requiredHours) {
      const remainingMinutes = Math.ceil((requiredHours - hoursElapsed) * 60);
      return res.status(400).json({ 
        message: `Equipment can be collected in ${remainingMinutes} minutes. Please wait.`,
        status: false,
        remaining_minutes: remainingMinutes
      });
    }

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

    const order = await Order.findById(order_id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.rental_status !== "Ongoing") return res.status(400).json({ message: "Only 'Ongoing' orders can be returned." });
    if (String(order.userId) !== userId) return res.status(403).json({ message: "Only the user can return the order." });

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

    const order = await Order.findById(order_id).populate("equipmentId");
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (String(order.equipmentId.ownerId) !== sellerId) return res.status(403).json({ message: "Only the owner can finish the order." });
    if (!["Returned", "Late"].includes(order.rental_status)) {
      return res.status(400).json({ message: "Only 'Returned' or 'Late' orders can be finished." });
    }

    // ✅ Check if required time has passed since return (only for 'Returned' status)
    if (order.rental_status === "Returned") {
      const returnTime = order.status_change_timestamp;
      const now = new Date();
      const hoursElapsed = (now - returnTime) / (1000 * 60 * 60);
      const requiredHours = timeOffsetHours;

      if (hoursElapsed < requiredHours) {
        const remainingMinutes = Math.ceil((requiredHours - hoursElapsed) * 60);
        return res.status(400).json({ 
          message: `Order can be finished in ${remainingMinutes} minutes. Please wait.`,
          status: false,
          remaining_minutes: remainingMinutes
        });
      }
    }
    // Late orders can be finished immediately (no time restriction)

    order.rental_status = "Finished";
    order.updated_at = new Date();
    order.status_change_timestamp = new Date();

    const equipment = await Equipment.findById(order.equipmentId);
    equipment.equipment_status = "Active";
    await equipment.save();
    await order.save();

    // Process settlement for finished order
    try {
      if (order.rental_status === 'Late' && order.penalty_amount > 0) {
        // Process as late return with penalty
        await processLateReturnSettlement(order._id, order.penalty_amount);
        console.log(`💰 Late return settlement processed for order: ${order._id}`);
      } else {
        // Process as normal completion
        await processOrderCompletion(order._id);
        console.log(`💰 Completion settlement processed for order: ${order._id}`);
      }
    } catch (settlementError) {
      console.error(`❌ Settlement error for finished order ${order._id}:`, settlementError);
      // Continue with order completion even if settlement fails
    }

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

    const order = await Order.findById(orderId).populate("equipmentId");
    if (!order) return res.status(404).json({ message: "Order not found." });

    if (String(order.equipmentId.ownerId) !== String(userId)) {
      return res.status(403).json({ message: "Only the owner can toggle penalty." });
    }

    order.penalty_apply = !order.penalty_apply;
    // ✅ Only update updated_at, not status_change_timestamp (penalty toggle doesn't affect monitoring)
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
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found." });

    order.buyer_review = {
      rating,
      comment: comment || "",
    };

    // ✅ Only update updated_at, not status_change_timestamp (reviews don't affect monitoring)
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

// Dispute penalty
exports.disputePenalty = async (req, res) => {
  try {
    const userId = req.userId;
    const { orderId, dispute_reason } = req.body;

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Valid Order ID is required." });
    }

    if (!dispute_reason || dispute_reason.trim() === '') {
      return res.status(400).json({ message: "Dispute reason is required." });
    }

    const order = await Order.findById(orderId).populate('equipmentId', 'name ownerId');
    if (!order) return res.status(404).json({ message: "Order not found." });

    // Check if the user is the renter
    if (String(order.userId) !== userId) {
      return res.status(403).json({ message: "Only the renter can dispute penalties." });
    }

    // Check if order has penalties
    if (!order.penalty_apply || order.penalty_amount <= 0) {
      return res.status(400).json({ message: "No penalties to dispute for this order." });
    }

    // Get user details
    const User = require('../models/user');
    const renter = await User.findById(userId).select('name email');
    const owner = await User.findById(order.equipmentId.ownerId).select('name email');

    // Send admin notification for penalty dispute
    await createAdminNotification(
      'penalty_dispute',
      `${renter.name} disputed penalty of $${order.penalty_amount} for order ${orderId}`,
      {
        userId: userId,
        equipmentId: order.equipmentId._id,
        orderId: order._id,
        data: {
          equipmentName: order.equipmentId.name,
          renterName: renter.name,
          renterEmail: renter.email,
          ownerName: owner.name,
          ownerEmail: owner.email,
          penaltyAmount: order.penalty_amount,
          disputeReason: dispute_reason.trim(),
          disputeDate: new Date(),
          orderStatus: order.rental_status
        }
      }
    );

    return res.status(200).json({
      message: "Penalty dispute submitted successfully. Admin will review your case.",
      success: true
    });

  } catch (error) {
    return res.status(500).json({ message: "Error submitting penalty dispute.", error: error.message });
  }
};

// Helper: Calculates future time offset
const getFutureTime = (timestamp, offsetMinutes) => {
  return moment(timestamp).add(offsetMinutes, 'minutes').toDate();
};

// Helper: Fetch the latest order from the database
const getLatestOrder = async (orderId) => {
  return await Order.findById(orderId);
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

  // Only update updated_at if it's not a status-only change
  const isStatusOnlyChange = Object.keys(updates).every(key => 
    ['rental_status', 'status_change_timestamp', 'penalty_amount', 'penalty_apply'].includes(key)
  );

  Object.assign(order, updates, requiredFields);
  
  if (!isStatusOnlyChange) {
    order.updated_at = new Date();
  }

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
    const orders = await Order.find({
      rental_status: { $in: ['Delivered', 'Returned', 'Ongoing', 'Late'] }
    });

    for (const order of orders) {
      const latestOrder = await getLatestOrder(order._id);
      if (!latestOrder) continue;

      if (latestOrder.rental_status !== order.rental_status) {
        console.log(`⏳ Order ${order._id} status changed externally to ${latestOrder.rental_status}. Skipping for now.`);
        continue;
      }

      const futureTimestamp = getFutureTime(order.status_change_timestamp, timeOffsetHours * 60);

      // Debug logging for timing
      if (order.rental_status === 'Delivered') {
        const hoursElapsed = ((now - order.status_change_timestamp) / (1000 * 60 * 60)).toFixed(1);
        const hoursRequired = timeOffsetHours;
        console.log(`⏱️  Order ${order._id} Delivered: ${hoursElapsed}h elapsed, needs ${hoursRequired}h`);
      }

      if (order.rental_status === 'Delivered' && now >= futureTimestamp) {
        await updateOrder(order, {
          rental_status: 'Ongoing',
          status_change_timestamp: new Date()
        });
        const hoursWaited = ((now - order.status_change_timestamp) / (1000 * 60 * 60)).toFixed(1);
        console.log(`🚀 Order ${order._id} changed from Delivered → Ongoing (waited ${hoursWaited}h)`);
      }

      if (order.rental_status === 'Ongoing' && order.rental_schedule?.end_date && now > order.rental_schedule.end_date) {
        await updateOrder(order, {
          rental_status: 'Late',
          penalty_apply: true,
          status_change_timestamp: order.rental_schedule.end_date,
          penalty_amount: DAILY_PENALTY
        });

        // Send admin notification for late return
        try {
          const equipment = await Equipment.findById(order.equipmentId).populate('ownerId', 'name email');
          const User = require('../models/user');
          const renter = await User.findById(order.userId).select('name email');
          const daysLate = Math.ceil((now - order.rental_schedule.end_date) / (1000 * 60 * 60 * 24));

          await createAdminNotification(
            'late_return_alert',
            `Order ${order._id} is ${daysLate} day(s) overdue for return`,
            {
              userId: order.userId,
              equipmentId: order.equipmentId,
              orderId: order._id,
              data: {
                equipmentName: equipment?.name || 'Unknown',
                renterName: renter?.name || 'Unknown',
                renterEmail: renter?.email || 'Unknown',
                ownerName: equipment?.ownerId?.name || 'Unknown',
                daysLate: daysLate,
                originalEndDate: order.rental_schedule.end_date,
                penaltyAmount: DAILY_PENALTY,
                lateDate: new Date()
              }
            }
          );
        } catch (notificationError) {
          console.error('Error sending late return notification:', notificationError);
        }

        console.log(`⏳ Order ${order._id} changed from Ongoing → Late!`);
      }

      if (order.rental_status === 'Late') {
        await applyLatePenalty(order);
      }

      // Debug logging for Returned orders
      if (order.rental_status === 'Returned') {
        const hoursElapsed = ((now - order.status_change_timestamp) / (1000 * 60 * 60)).toFixed(1);
        const hoursRequired = timeOffsetHours;
        console.log(`⏱️  Order ${order._id} Returned: ${hoursElapsed}h elapsed, needs ${hoursRequired}h`);
      }

      if (order.rental_status === 'Returned' && now >= futureTimestamp) {
        await updateOrder(order, {
          rental_status: 'Finished',
          status_change_timestamp: new Date()
        });
        const hoursWaited = ((now - order.status_change_timestamp) / (1000 * 60 * 60)).toFixed(1);
        console.log(`🚀 Order ${order._id} changed from Returned → Finished (waited ${hoursWaited}h)`);
        
        // Process settlement for automatically finished order
        try {
          await processOrderCompletion(order._id);
          console.log(`💰 Auto-completion settlement processed for order: ${order._id}`);
        } catch (settlementError) {
          console.error(`❌ Auto-settlement error for order ${order._id}:`, settlementError);
          // Continue with order processing even if settlement fails
        }
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

    // Get percentage settings for pricing inputs audit trail
    const percentageSettings = await require('../models/percentageSettings').findOne({}) || {};

    const orders = await Order.aggregate([
      {
        $lookup: {
          from: "equipments",
          localField: "equipmentId",
          foreignField: "_id",
          as: "equipment",
        },
      },
      { $unwind: "$equipment" },
      ...createSubcategoryLookupPipeline(),
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "equipment.ownerId",
          foreignField: "_id",
          as: "owner",
        },
      },
      { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },
      { $match: statusFilter },
      {
        $project: {
          _id: 1,
          rental_status: 1,
          rental_schedule: 1,
          location: 1,
          rental_fee: 1,
          platform_fee: 1,
          tax_amount: 1,
          insurance_amount: 1,
          deposit_amount: 1,
          subtotal: 1,
          total_amount: 1,
          security_option: 1,
          penalty_apply: 1,
          penalty_amount: 1,
          buyer_review: 1,
          return_status: 1,
          cancellation: 1,
          owner_images: 1,
          buyer_images: 1,
          status_change_timestamp: 1,
          createdAt: 1,
          updatedAt: 1,
          equipment: {
            _id: "$equipment._id",
            name: "$equipment.name",
            images: "$equipment.images",
            rental_price: "$equipment.rental_price",
            ownerId: "$equipment.ownerId",
          },
          category: {
            _id: "$category._id",
            name: "$category.name",
          },
          subcategory: {
            _id: "$subcategory._id",
            name: "$subcategory.name",
          },
          user: {
            _id: "$user._id",
            name: "$user.name",
            email: "$user.email",
            profile_image: "$user.profile_image",
          },
          owner: {
            _id: "$owner._id",
            name: "$owner.name",
            email: "$owner.email",
            profile_image: "$owner.profile_image",
          },
        },
      },
    ]);

    const formattedOrders = orders.map(order => {
      // Calculate rental days
      const startDate = new Date(order.rental_schedule.start_date);
      const endDate = new Date(order.rental_schedule.end_date);
      const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // Calculate equipment value (estimated from daily rate * 30 days)
      const estimatedEquipmentValue = (order.equipment.rental_price * 30);

      return {
        order: {
          _id: order._id,

          equipment: {
            _id: order.equipment._id,
            name: order.equipment.name,
            category: order.category?.name || "Uncategorized",
            subcategory: order.subcategory?.name || "Uncategorized",
            daily_rate: order.equipment.rental_price,
            images: order.equipment.images || []
          },

          parties: {
            buyer: {
              _id: order.user._id,
              name: order.user.name,
              email: order.user.email
            },
            owner: {
              _id: order.owner._id,
              name: order.owner.name,
              email: order.owner.email
            }
          },

          rental_schedule: {
            start_date: order.rental_schedule.start_date,
            end_date: order.rental_schedule.end_date,
            days: days
          },

          location: order.location,

          security_option: {
            insurance: order.security_option?.insurance || false
          },

          pricing: {
            rental_fee: order.rental_fee,
            insurance_amount: order.insurance_amount || 0,
            deposit_amount: order.deposit_amount || 0,
            platform_fee: order.platform_fee,
            tax_amount: order.tax_amount,
            subtotal: order.subtotal,
            total_amount: order.total_amount,

            inputs: {
              equipment_value: estimatedEquipmentValue,
              admin_fee_percent: percentageSettings.adminFeePercentage || 0,
              tax_percent: percentageSettings.taxPercentage || 0,
              base_insurance_percent: percentageSettings.insurancePercentage || 0,
              daily_insurance_multiplier: percentageSettings.dailyInsuranceMultiplier || 0,
              deposit_percent: percentageSettings.depositPercentage || 0
            }
          },

          images: {
            owner_images: order.owner_images || [],
            buyer_images: order.buyer_images || []
          },

          status: {
            rental_status: order.rental_status,
            return_status: order.return_status || { is_returned: false, returned_at: null },
            cancellation: order.cancellation || { is_cancelled: false, reason: null, cancelled_at: null },
            penalty: {
              penalty_apply: order.penalty_apply || false,
              penalty_amount: order.penalty_amount || 0
            }
          },

          review: {
            rating: order.buyer_review?.rating || 0,
            comment: order.buyer_review?.comment || null
          },

          timestamps: {
            status_change_timestamp: order.status_change_timestamp,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
          }
        },

        ui_helpers: {
          display: {
            duration_label: `${startDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} ${startDate.getDate()} → ${endDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} ${endDate.getDate()} (${days} day(s))`,
            address_short: order.location.address
          },
          refund_preview: {
            enabled: !order.security_option?.insurance,
            stripe_fee_percent: percentageSettings.stripeFeePercentage || 0,
            refundable_deposit_amount: !order.security_option?.insurance ? order.deposit_amount : null
          }
        }
      };
    });

    return res.status(200).json({
      message: "Rentals fetched successfully.",
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    console.error('Error in getRentalsByStatus:', error);
    return res.status(500).json({
      message: "Error fetching rentals.",
      error: error.message,
    });
  }
};
