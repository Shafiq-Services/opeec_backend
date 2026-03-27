const mongoose = require("mongoose");
const Orders = require("../models/orders");
const Users = require("../models/User");
const Equipments = require("../models/equipment");

/**
 * Fetches the average rating of an equipment based on buyer reviews in orders.
 * @param {mongoose.Types.ObjectId | string} equipmentId - The ID of the equipment.
 * @returns {Promise<number>} - The average rating (rounded to 1 decimal place) or 0 if no ratings exist.
 */
const getAverageRating = async (equipmentId) => {
  if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
    return 0;
  }

  try {
    const eqId = new mongoose.Types.ObjectId(equipmentId);
    const result = await Orders.aggregate([
      { $match: { equipmentId: eqId } },
      { $match: { "buyer_review.rating": { $gte: 1 } } },
      {
        $group: {
          _id: "$equipmentId",
          averageRating: { $avg: "$buyer_review.rating" },
        },
      },
    ]);

    return result.length > 0 ? parseFloat(result[0].averageRating.toFixed(1)) : 0;
  } catch (error) {
    console.error("Error calculating average rating:", error);
    return 0;
  }
};

const getEquipmentRatingsList = async (equipmentId) => {
  if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
    return [];
  }

  try {
    const orders = await Orders.find(
      { equipmentId, "buyer_review.rating": { $gte: 1 } },
      "buyer_review.comment buyer_review.rating userId"
    );

    if (orders.length === 0) {
      return [];
    }

    const userIds = [...new Set(orders.map((order) => order.userId.toString()))];

    const users = await Users.find({ _id: { $in: userIds } }, "name");

    const userMap = users.reduce((map, user) => {
      map[user._id.toString()] = user.name;
      return map;
    }, {});

    return orders.map((order) => ({
      name: userMap[order.userId.toString()] || "Anonymous",
      comment: order.buyer_review.comment || "",
      rating: order.buyer_review.rating,
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
    const userEquipment = await Equipments.find({ ownerId: userId }, "_id");
    const equipmentIds = userEquipment.map((eq) => eq._id.toString());

    if (equipmentIds.length === 0) {
      return 0;
    }

    const orders = await Orders.find(
      { equipmentId: { $in: equipmentIds }, "buyer_review.rating": { $gte: 1 } },
      "buyer_review.rating"
    );

    if (orders.length === 0) {
      return 0;
    }

    const totalRating = orders.reduce((sum, order) => sum + order.buyer_review.rating, 0);
    return parseFloat((totalRating / orders.length).toFixed(1));
  } catch (error) {
    return 0;
  }
};

const getSellerReviews = async (sellerId) => {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    return [];
  }

  try {
    const ownedEquipments = await Equipments.find({ ownerId: sellerId }, "_id");
    const equipmentIds = ownedEquipments.map((eq) => eq._id);

    if (equipmentIds.length === 0) {
      return [];
    }

    const orders = await Orders.find(
      {
        equipmentId: { $in: equipmentIds },
        "buyer_review.rating": { $gte: 1 },
      },
      "buyer_review userId"
    );

    if (orders.length === 0) {
      return [];
    }

    const userIds = [...new Set(orders.map((order) => order.userId.toString()))];
    const users = await Users.find({ _id: { $in: userIds } }, "name");

    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user.name;
      return acc;
    }, {});

    return orders.map((order) => ({
      name: userMap[order.userId.toString()] || "Anonymous",
      comment: order.buyer_review.comment || "",
      rating: order.buyer_review.rating,
    }));
  } catch (error) {
    console.error("Error fetching seller reviews:", error);
    return [];
  }
};

module.exports = { getAverageRating, getEquipmentRatingsList, getUserAverageRating, getSellerReviews };
