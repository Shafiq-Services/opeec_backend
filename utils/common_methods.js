const mongoose = require("mongoose");
const Orders = require("../models/orders"); // Adjust the path based on your project structure
const Users = require("../models/User"); // Adjust path based on your project structure
const Equipments = require("../models/equipment");

/**
 * Fetches the average rating of an equipment based on buyer reviews in orders.
 * @param {mongoose.Types.ObjectId | string} equipmentId - The ID of the equipment.
 * @returns {Promise<number>} - The average rating (rounded to 1 decimal place) or 0 if no ratings exist.
 */
const getAverageRating = async (equipmentId) => {
  if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
    return 0; // Return 0 if the equipmentId is invalid
  }

  try {
    const result = await Orders.aggregate([
      { $match: { equipment_id: new mongoose.Types.ObjectId(equipmentId) } },
      { $match: { "buyer_review.rating": { $gte: 1 } } }, // Only include orders with a rating
      {
        $group: {
          _id: "$equipment_id",
          averageRating: { $avg: "$buyer_review.rating" },
        },
      },
    ]);

    return result.length > 0 ? parseFloat(result[0].averageRating.toFixed(1)) : 0;
  } catch (error) {
    console.error("Error calculating average rating:", error);
    return 0; // Return 0 in case of an error
  }
};

const getEquipmentRatingsList = async (equipmentId) => {
    if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
      return []; // Return empty list if the equipmentId is invalid
    }
  
    try {
      // Fetch all orders for the given equipment ID that have a valid rating
      const orders = await Orders.find(
        { equipment_id: equipmentId, "buyer_review.rating": { $gte: 1 } }, 
        "buyer_review.comment buyer_review.rating user_id" // Select only required fields
      );
  
      if (orders.length === 0) {
        return [];
      }
  
      // Extract unique user IDs
      const userIds = [...new Set(orders.map(order => order.user_id.toString()))];
  
      // Fetch user details separately
      const users = await Users.find(
        { _id: { $in: userIds } }, 
        "name"
      );
  
      // Create a mapping of userId to user name
      const userMap = users.reduce((map, user) => {
        map[user._id.toString()] = user.name;
        return map;
      }, {});
  
      // Map orders to return formatted list
      return orders.map(order => ({
        name: userMap[order.user_id.toString()] || "Anonymous", // Default to "Anonymous" if user not found
        comment: order.buyer_review.comment || "", // Default empty string if no comment
        rating: order.buyer_review.rating
      }));
  
    } catch (error) {
      console.error("Error fetching equipment ratings list:", error);
      return [];
    }
  };

  const getUserAverageRating = async (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return 0;
    }
  
    try {
      // Fetch all equipment owned by the user
      const userEquipment = await Equipments.find({ owner_id: userId }, "_id");
      const equipmentIds = userEquipment.map(eq => eq._id.toString());
  
      if (equipmentIds.length === 0) {
        return 0;
      }
  
      // Fetch all orders where the equipment belongs to this user and has a rating
      const orders = await Orders.find(
        { equipment_id: { $in: equipmentIds }, "buyer_review.rating": { $gte: 1 } },
        "buyer_review.rating"
      );
  
      if (orders.length === 0) {
        return 0;
      }
  
      // Calculate the average rating
      const totalRating = orders.reduce((sum, order) => sum + order.buyer_review.rating, 0);
      return parseFloat((totalRating / orders.length).toFixed(1)); // Round to 1 decimal place
  
    } catch (error) {
      return 0;
    }
  };

module.exports = { getAverageRating, getEquipmentRatingsList, getUserAverageRating };
