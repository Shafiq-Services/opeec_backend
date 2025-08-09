const mongoose = require('mongoose');
const Equipment = require('../models/equipment');
const User = require('../models/user');
const Category = require('../models/categories');
const Conversation = require('../models/conversation');
const jwt = require('jsonwebtoken');
const { getAverageRating, getEquipmentRatingsList, getUserAverageRating, getSellerReviews} = require("../utils/common_methods");
const Order = require('../models/orders');
const { sendEventToUser } = require('../utils/socketService');

// Helper function to find subcategory by ID across all categories
async function findSubCategoryById(subCategoryId) {
  try {
    const category = await Category.findOne({
      'sub_categories._id': subCategoryId
    });
    
    if (!category) return null;
    
    const subCategory = category.sub_categories.find(
      sub => sub._id.toString() === subCategoryId.toString()
    );
    
    return subCategory ? {
      ...subCategory.toObject(),
      categoryId: category._id,
      categoryName: category.name
    } : null;
  } catch (error) {
    console.error('Error finding subcategory:', error);
    return null;
  }
}

// Helper function to get subcategory details by ID
async function getSubCategoryDetails(subCategoryId) {
  const subCategoryData = await findSubCategoryById(subCategoryId);
  if (!subCategoryData) return null;
  
  return {
    _id: subCategoryData._id,
    name: subCategoryData.name,
    security_fee: subCategoryData.security_fee,
    categoryId: subCategoryData.categoryId,
    categoryName: subCategoryData.categoryName
  };
}

// Helper function to get multiple subcategory details efficiently
async function getMultipleSubCategoryDetails(subCategoryIds) {
  try {
    const categories = await Category.find({
      'sub_categories._id': { $in: subCategoryIds }
    });
    
    const subCategoryMap = {};
    categories.forEach(category => {
      category.sub_categories.forEach(subCat => {
        if (subCategoryIds.includes(subCat._id.toString())) {
          subCategoryMap[subCat._id.toString()] = {
            categoryId: category._id,
            category_name: category.name,
            sub_category_name: subCat.name,
            security_fee: subCat.security_fee
          };
        }
      });
    });
    
    return subCategoryMap;
  } catch (error) {
    console.error('Error getting multiple subcategory details:', error);
    return {};
  }
}

const addEquipment = async (req, res) => {
  const {
    subCategoryId,
    name,
    make,
    model,
    serial_number,
    description,
    images,
    address,
    lat,
    lng,
    range,
    delivery_by_owner,
    rental_price,
    equipment_price,
    notice_period,
    minimum_trip_duration,
    maximum_trip_duration,
  } = req.body;

  try {
    // Ensure delivery_by_owner is provided and is a valid boolean
    if (delivery_by_owner === undefined || delivery_by_owner === null) {
      return res.status(400).json({ message: 'delivery_by_owner is required.' });
    }
    const isDeliveryByOwner = delivery_by_owner === true || delivery_by_owner === "true";

    // Validate required fields
    const requiredFields = [
      { name: 'subCategoryId', value: subCategoryId },
      { name: 'name', value: name },
      { name: 'make', value: make },
      { name: 'model', value: model },
      { name: 'serial_number', value: serial_number },
      { name: 'description', value: description },
      { name: 'address', value: address },
      { name: 'lat', value: lat },
      { name: 'lng', value: lng },
      { name: 'rental_price', value: rental_price },
      { name: 'equipment_price', value: equipment_price },
      { name: 'notice_period', value: notice_period },
      { name: 'minimum_trip_duration', value: minimum_trip_duration },
      { name: 'maximum_trip_duration', value: maximum_trip_duration }
    ];

    // Check for missing fields
    const missingFields = requiredFields.filter(field => 
      field.value === undefined || field.value === null || field.value === ''
    );

    if (missingFields.length > 0) {
      const missingFieldNames = missingFields.map(field => field.name).join(', ');
      return res.status(400).json({ 
        message: `Missing required fields: ${missingFieldNames}` 
      });
    }

    // Validate sub-category existence using embedded subcategories
    const subCategory = await findSubCategoryById(subCategoryId);
    if (!subCategory) return res.status(404).json({ message: 'Sub-category not found.' });

    // Create and save equipment
    const newEquipment = new Equipment({
      ownerId: req.userId,
      subCategoryId,
      name,
      make,
      model,
      serial_number,
      description,
      images,
      location: {
        address,
        lat,
        lng,
        ...(isDeliveryByOwner ? { range } : {})
      },
      delivery_by_owner: isDeliveryByOwner,
      rental_price,
      equipment_price,
      notice_period,
      minimum_trip_duration,
      maximum_trip_duration,
      equipment_status: "Pending",
    });

    const savedEquipment = await newEquipment.save();
    res.status(201).json({ message: 'Equipment added successfully.', data: savedEquipment });

  } catch (error) {
    console.error('Error adding equipment:', error);
    res.status(500).json({ message: 'Error adding equipment.', error: error.message });
  }
};


  const updateEquipment = async (req, res) => {
    const {
        subCategoryId,
        name,
        make,
        model,
        serial_number,
        description,
        images,
        address,
        lat,
        lng,
        range,
        delivery_by_owner,
        rental_price,
        equipment_price,
        notice_period,
        minimum_trip_duration,
        maximum_trip_duration,
    } = req.body;
    
    try {
        const equipmentId = req.params.id;
        const userId = req.userId; // Assuming user ID is extracted from token middleware for authentication
        // Validate required fields
        const requiredFields = [
            { name: 'subCategoryId', value: subCategoryId },
            { name: 'name', value: name },
            { name: 'make', value: make },
            { name: 'model', value: model },
            { name: 'serial_number', value: serial_number },
            { name: 'description', value: description },
            { name: 'address', value: address },
            { name: 'lat', value: lat },
            { name: 'lng', value: lng },
            { name: 'range', value: range },
            { name: 'rental_price', value: rental_price },
            { name: 'equipment_price', value: equipment_price },
            { name: 'notice_period', value: notice_period },
            { name: 'minimum_trip_duration', value: minimum_trip_duration },
            { name: 'maximum_trip_duration', value: maximum_trip_duration }
        ];

        for (const field of requiredFields) {
          if (field.value === null || field.value === undefined) 
          {
            return res.status(400).json({ message: `${field.name} is required.` });
          }
        }

        // Validate image constraints
        if (!images || images.length === 0) return res.status(400).json({ message: 'At least one image is required.' });
        if (images && images.length > 3) return res.status(400).json({ message: 'A maximum of 3 images are allowed.' });

            // Validate sub-category existence  
    const subCategory = await findSubCategoryById(subCategoryId);
    if (!subCategory) return res.status(404).json({ message: 'Sub-category not found.' });

        // Find the existing equipment by ID
        const equipment = await Equipment.findById(equipmentId);
        if (!equipment) return res.status(404).json({ message: 'Equipment not found.' });

        // Replace images instead of adding them
        if (images) {
            equipment.images = images; // Replace existing images with new ones
        }

        // Update the other fields
        equipment.subCategoryId = subCategoryId;
        equipment.name = name;
        equipment.make = make;
        equipment.model = model;
        equipment.serial_number = serial_number;
        equipment.description = description;
        equipment.location = { address, lat, lng, range };
        equipment.delivery_by_owner = delivery_by_owner;
        equipment.rental_price = rental_price;
        equipment.equipment_price = equipment_price;
        equipment.notice_period = notice_period;
        equipment.minimum_trip_duration = minimum_trip_duration;
        equipment.maximum_trip_duration = maximum_trip_duration;

        // Save the updated equipment
        const updatedEquipment = await equipment.save();
        res.status(200).json({ message: 'Equipment updated successfully.', data: updatedEquipment });

    } catch (error) {
        console.error('Error updating equipment:', error);
        res.status(500).json({ message: 'Error updating equipment.', error: error.message });
    }
};

async function getAllEquipments(req, res) {
  const userId = req.headers.authorization ? jwt.verify(req.headers.authorization.split(" ")[1], process.env.JWT_SECRET).userId : null;

  try {
    const { lat, lng, distance, name, categoryId, delivery_by_owner } = req.query;

    // ✅ Validate required parameters
    if (!lat || !lng) {
      return res.status(400).json({ message: "Latitude and longitude are required." });
    }

    let query = {};

    // ✅ Exclude equipment owned by the logged-in user if token is provided
    if (req.user && req.user._id) {
      query.ownerId = { $ne: req.user._id };
    }

    // ✅ Optional filters
    if (name) {
      query.name = { $regex: name, $options: "i" }; // Case-insensitive search
    }

    if (delivery_by_owner !== undefined) {
      query.delivery_by_owner = delivery_by_owner === "true";
    }

    if (categoryId) {
      const category = await Category.findById(categoryId);
      if (!category) return res.status(404).json({ message: 'Category not found.' });
      const subCategoryIds = category.sub_categories.map(subCat => subCat._id);
      query.subCategoryId = { $in: subCategoryIds };
    }

    // ✅ Geospatial filtering
    let geoPipeline = [];
    if (parseFloat(lat) !== 0.0 || parseFloat(lng) !== 0.0) {
      const maxDistanceKm = distance ? parseFloat(distance) : 50; // Default to 50km

      geoPipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          distanceField: "distance",
          maxDistance: maxDistanceKm * 1000, // Convert km to meters
          spherical: true,
        },
      });
    }

    geoPipeline.push({ $match: query });

    geoPipeline.push({
      $addFields: {
        tempLocation: {
          type: "Point",
          coordinates: ["$location.lng", "$location.lat"],
        },
      },
    });

    // ✅ Fetch filtered equipment
    const equipments = await Equipment.aggregate([
      { $match: { equipment_status: "Active" } },  // Filter only active equipment
      ...geoPipeline  // Spread the existing pipeline
    ]);
    

    // ✅ Fetch subcategories and categories using helper function
    const subCategoryIds = equipments.map(equipment => equipment.subCategoryId.toString());
    const subCategoryMap = await getMultipleSubCategoryDetails(subCategoryIds);

    // ✅ Enhanced equipment response with all details
    const formattedEquipments = await Promise.all(equipments.map(async (equipment) => {
      const subCategoryDetails = subCategoryMap[equipment.subCategoryId.toString()];

      if (!subCategoryDetails) {
        // If subcategory details not found, try to fetch individually
        const subCategoryData = await findSubCategoryById(equipment.subCategoryId);

        return {
          _id: equipment._id,
          average_rating: await getAverageRating(equipment._id),
          created_at: equipment.createdAt ? equipment.createdAt.toGMTString() : new Date().toGMTString(),
          delivery_by_owner: equipment.delivery_by_owner,
          description: equipment.description,
          equipment_price: equipment.equipment_price,
          images: equipment.images,
          isFavorite: userId ? (await User.findById(userId))?.favorite_equipments.includes(equipment._id) || false : false,
          location: {
            address: equipment.location?.address || "",
            lat: equipment.location?.lat || 0.0,
            lng: equipment.location?.lng || 0.0,
            range: equipment.location?.range || 0,
          },
          make: equipment.make,
          maximum_trip_duration: equipment.maximum_trip_duration,
          minimum_trip_duration: equipment.minimum_trip_duration,
          model: equipment.model,
          name: equipment.name,
          notice_period: equipment.notice_period,
          ownerId: equipment.ownerId,
          postal_code: equipment.postal_code,
          rental_price: equipment.rental_price,
          serial_number: equipment.serial_number,
          sub_category_id: equipment.subCategoryId,
          sub_category_name: subCategoryData ? subCategoryData.name : 'Unknown',
          categoryId: subCategoryData ? subCategoryData.categoryId : null,
          category_name: subCategoryData ? subCategoryData.categoryName : 'Unknown',
          equipment_status: equipment.equipment_status,
          reason: ["Rejected", "Blocked"].includes(equipment.equipment_status) ? equipment.reason : "",
        };
      }

      return {
        _id: equipment._id,
        average_rating: await getAverageRating(equipment._id),
        created_at: equipment.createdAt ? equipment.createdAt.toGMTString() : new Date().toGMTString(),
        delivery_by_owner: equipment.delivery_by_owner,
        description: equipment.description,
        equipment_price: equipment.equipment_price,
        images: equipment.images,
        isFavorite: userId ? (await User.findById(userId))?.favorite_equipments.includes(equipment._id) || false : false,
        location: {
          address: equipment.location?.address || "",
          lat: equipment.location?.lat || 0.0,
          lng: equipment.location?.lng || 0.0,
          range: equipment.location?.range || 0,
        },
        make: equipment.make,
        maximum_trip_duration: equipment.maximum_trip_duration,
        minimum_trip_duration: equipment.minimum_trip_duration,
        model: equipment.model,
        name: equipment.name,
        notice_period: equipment.notice_period,
        ownerId: equipment.ownerId,
        postal_code: equipment.postal_code,
        rental_price: equipment.rental_price,
        serial_number: equipment.serial_number,
        sub_category_id: equipment.subCategoryId,
        sub_category_name: subCategoryDetails.sub_category_name,
        categoryId: subCategoryDetails.categoryId, // ✅ Fixed category reference
        category_name: subCategoryDetails.category_name,
        equipment_status: equipment.equipment_status,
        reason: ["Rejected", "Blocked"].includes(equipment.equipment_status) ? equipment.reason : "",
      };
    }));
    

    return res.status(200).json({
      equipments: formattedEquipments,
      message: "Equipments retrieved successfully",
      status: true,
    });
  } catch (error) {
    console.error("Error fetching equipments:", error);
    return res.status(500).json({ message: "Failed to retrieve equipments" });
  }
}

async function getMyEquipments(req, res) {
  const userId = req.userId;
  try {
    const { equipment_status } = req.query;

    if (!equipment_status) {
      return res.status(400).json({ message: "Equipment status is required." });
    }

    const validStatuses = ["Pending", "Rejected", "InActive", "Active", 'Blocked', "All"];
    if (!validStatuses.includes(equipment_status)) {
      return res.status(400).json({ message: "Invalid equipment status." });
    }

    let query = {};

    // ✅ Filter by `equipment_status` (only one status or "all")
    if (equipment_status !== "All") {
      query.equipment_status = equipment_status;
    }

    // ✅ Fetch filtered equipment
    const equipments = await Equipment.find({
      ownerId: userId,
      ...(equipment_status !== "All" && { equipment_status }),
    });
    

    // ✅ Fetch subcategories and categories using helper function
    const subCategoryIds = equipments.map(equipment => equipment.subCategoryId.toString());
    const subCategoryMap = await getMultipleSubCategoryDetails(subCategoryIds);

    // ✅ Format response
    const formattedEquipments = await Promise.all(
      equipments.map(async (equipment) => {
        // Get subcategory details from map or fetch individually
        const subCategoryDetails = subCategoryMap[equipment.subCategoryId.toString()];
        let subCategory, category;
        
        if (subCategoryDetails) {
          subCategory = { name: subCategoryDetails.sub_category_name };
          category = { _id: subCategoryDetails.categoryId, name: subCategoryDetails.category_name };
        } else {
          const subCategoryData = await findSubCategoryById(equipment.subCategoryId);
          subCategory = subCategoryData ? { name: subCategoryData.name } : null;
          category = subCategoryData ? { _id: subCategoryData.categoryId, name: subCategoryData.categoryName } : null;
        }
        const owner = await User.findById(equipment.ownerId);

        return {
          _id: equipment._id,
          average_rating: await getAverageRating(equipment._id),
          created_at: equipment.createdAt ? equipment.createdAt.toGMTString() : new Date().toGMTString(),
          delivery_by_owner: equipment.delivery_by_owner,
          description: equipment.description,
          equipment_price: equipment.equipment_price,
          images: equipment.images,
          isFavorite: owner.favorite_equipments.includes(equipment._id), // All these are favorites
          location: {
            address: equipment.location?.address || "",
            lat: equipment.location?.lat || 0.0,
            lng: equipment.location?.lng || 0.0,
            range: equipment.location?.range || 0,
          },
          make: equipment.make,
          maximum_trip_duration: equipment.maximum_trip_duration,
          minimum_trip_duration: equipment.minimum_trip_duration,
          model: equipment.model,
          name: equipment.name,
          notice_period: equipment.notice_period,
          ownerId: equipment.ownerId,
          postal_code: equipment.postal_code,
          rental_price: equipment.rental_price,
          serial_number: equipment.serial_number,
          sub_category_id: equipment.subCategoryId,
          sub_category_name: subCategory ? subCategory.name : null,
          category_id: category ? category._id : null, // ✅ Use category details
          category_name: category ? category.name : null,
          equipment_status: equipment.equipment_status,
          reason: ["Rejected", "Blocked"].includes(equipment.equipment_status) ? equipment.reason : "",
        };
      })
    );
    

    return res.status(200).json({
      equipments: formattedEquipments,
      message: "Equipments retrieved successfully",
      status: true,
    });
  } catch (error) {
    console.error("Error fetching equipments:", error);
    return res.status(500).json({ message: "Failed to retrieve equipments" });
  }
}

// Helper function to match query filters
function queryMatches(equipment, query) {
  for (const key in query) {
    if (Array.isArray(query[key]) && !query[key].includes(equipment[key])) {
      return false;
    }
    if (!Array.isArray(query[key]) && equipment[key] !== query[key]) {
      return false;
    }
  }
  return true;
}


  async function getEquipmentDetails(req, res) {
    try {
      const equipmentId = req.query.equipment_id;

      // Find the equipment by ID
      const equipment = await Equipment.findById(equipmentId);
      if (!equipment) {
        return res.status(404).json({
          message: 'Equipment not found',
          status: false
        });
      }
        
      // Fetch owner details
      const owner = await User.findById(equipment.ownerId, 'name profile_image');
      const ownerId = owner._id;
      const token = req.headers.authorization?.split(" ")[1];
      var conversationId = "";

      if (token && token.trim() !== "") {  // Ensure token is not empty or just whitespace
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const currentUserId = decoded.userId;
          console.log(ownerId);
          console.log(currentUserId);
      
          conversationId = await Conversation.findOne({ 
            participants: { $all: [ownerId, currentUserId] } 
          }).select('_id').lean();
      
          conversationId = conversationId?._id || "";
          console.log(conversationId);
        } catch (error) {
          console.error("Invalid token:", error);
          return res.status(401).json({ message: "Invalid or malformed token" });
        }
      }
      
      // Formatting the equipment details
      const equipmentDetails = {
        _id: equipment._id,
        created_at: equipment.createdAt ? equipment.createdAt.toGMTString() : new Date().toGMTString(),
        delivery_by_owner: equipment.delivery_by_owner || false,
        description: equipment.description || '',
        equipment_price: equipment.equipment_price || 0,
        images: equipment.images || [],
        equipment_status: equipment.equipment_status,
        location: {
          address: equipment.location?.address || '',
          lat: equipment.location?.lat || 0.0,
          lng: equipment.location?.lng || 0.0,
          range: equipment.location?.range || 0,
        },
        make: equipment.make || '',
        maximum_trip_duration: equipment.maximum_trip_duration || { count: 0, type: '' },
        message: 'Equipment details retrieved successfully',
        minimum_trip_duration: equipment.minimum_trip_duration || { count: 0, type: '' },
        model: equipment.model || '',
        name: equipment.name || '',
        notice_period: equipment.notice_period || { count: 0, type: '' },
        owner: {
          id: owner?._id || null,
          name: owner?.name || '',
          profile_image: owner?.profile_image || ''
        },
        postal_code: equipment.postal_code || '',
        average_rating: await getAverageRating(equipment._id), // Assuming default value
        ratings: await getEquipmentRatingsList(equipment._id),
        rental_price: equipment.rental_price || 0,
        serial_number: equipment.serial_number || '',
        status: equipment.status || true,
        reason: equipment.reason || '',
        sub_category_fk: equipment.subCategoryId || '',
        conversationId,
      };
  
      // Returning the response
      return res.status(200).json(equipmentDetails);
    } catch (error) {
      console.error('Error fetching equipment details:', error);
      return res.status(500).json({
        message: 'Failed to retrieve equipment details',
        status: false
      });
    }
  }
  
  async function deleteEquipment(req, res) {
    try {
      const equipmentId = req.query.equipmentId; // Extract equipment ID from request parameters
      const userId = req.userId; // Assuming user ID is extracted from token middleware for authentication
  
      // Find the equipment by ID
      const equipment = await Equipment.findById(equipmentId);
  
      if (!equipment) {
        return res.status(404).json({
          message: 'Equipment not found',
          status: false
        });
      }
  
      // Delete the equipment
      await Equipment.findByIdAndDelete(equipmentId);
  
      return res.status(200).json({
        message: 'Equipment deleted successfully',
        status: true
      });
    } catch (error) {
      console.error('Error deleting equipment:', error);
      return res.status(500).json({
        message: 'Failed to delete equipment',
        status: false
      });
    }
  }

  async function getRandomEquipmentImages(req, res) {
    try {
      // Fetch all live equipment with populated owner details only
      const equipments = await Equipment.find({ equipment_status: "Active" })
        .populate({
          path: 'ownerId',
          model: User, // Reference to User model
          select: '_id name email profile_image' // Selecting only necessary fields
        });
  
      if (!equipments || equipments.length === 0) {
        return res.status(200).json({
          message: 'No equipment found',
          status: false,
        });
      }
  
      // Manually populate subcategory data for each equipment
      const equipmentWithSubCategories = await Promise.all(
        equipments.map(async (equipment) => {
          const subCategoryData = await findSubCategoryById(equipment.subCategoryId);
          return {
            ...equipment.toObject(),
            subCategoryData: subCategoryData
          };
        })
      );
  
      const categoryMap = {};
      const result = [];
      const usedEquipmentIds = new Set();
  
      // Group equipment by categories
      equipmentWithSubCategories.forEach((equipment) => {
        if (equipment.subCategoryData && equipment.subCategoryData.categoryId) {
          const categoryId = equipment.subCategoryData.categoryId.toString();
          if (!categoryMap[categoryId]) {
            categoryMap[categoryId] = [];
          }
          categoryMap[categoryId].push(equipment);
        }
      });
  
      // Flatten categories into an array
      const categoryIds = Object.keys(categoryMap);
  
      // Main logic to generate 20 unique images
      while (result.length < 20) {
        // Shuffle the category order
        categoryIds.sort(() => Math.random() - 0.5);
  
        for (const categoryId of categoryIds) {
          const categoryEquipments = categoryMap[categoryId];
  
          // Randomize equipment within the category
          const availableEquipments = categoryEquipments.filter(
            (equipment) => !usedEquipmentIds.has(equipment._id.toString())
          );
  
          // Pick random equipment from this category
          const equipment =
            availableEquipments.length > 0
              ? availableEquipments[
                  Math.floor(Math.random() * availableEquipments.length)
                ]
              : categoryEquipments[
                  Math.floor(Math.random() * categoryEquipments.length)
                ];
  
          if (equipment.images && equipment.images.length > 0) {
            // Pick a random image from this equipment
            const randomImage =
              equipment.images[
                Math.floor(Math.random() * equipment.images.length)
              ];
  
            result.push({
              equipmentId: equipment._id,
              image: randomImage,
              owner: equipment.ownerId
                ? {
                    _id: equipment.ownerId._id,
                    name: equipment.ownerId.name,
                    email: equipment.ownerId.email,
                    profile_image: equipment.ownerId.profile_image,
                  }
                : null,
            });
  
            usedEquipmentIds.add(equipment._id.toString());
          }
  
          if (result.length === 20) break;
        }
  
        // If all categories are exhausted, allow repeating equipment
        if (result.length < 20 && usedEquipmentIds.size === equipmentWithSubCategories.length) {
          break;
        }
      }
  
      // Fill up to 20 results if fewer than 20 images were added
      while (result.length < 20) {
        const randomEquipment =
          equipmentWithSubCategories[Math.floor(Math.random() * equipmentWithSubCategories.length)];
        
        if (randomEquipment.images && randomEquipment.images.length > 0) {
          const randomImage =
            randomEquipment.images[
              Math.floor(Math.random() * randomEquipment.images.length)
            ];
          result.push({
            equipmentId: randomEquipment._id,
            image: randomImage,
            owner: randomEquipment.ownerId
              ? {
                  _id: randomEquipment.ownerId._id,
                  name: randomEquipment.ownerId.name,
                  email: randomEquipment.ownerId.email,
                  profile_image: randomEquipment.ownerId.profile_image,
                }
              : null,
          });
        }
      }
  
      return res.status(200).json({
        images: result,
        message: 'Random equipment images retrieved successfully',
        status: true,
      });
    } catch (error) {
      console.error('Error fetching random equipment images:', error);
      return res.status(500).json({
        message: 'Failed to retrieve images',
        status: false,
      });
    }
  }
  

async function getUserShop(req, res) {
  try {
    const ownerId = req.query.ownerId;
    const token = req.headers.authorization?.split(" ")[1];
    var conversationId = "";

    if (token && token.trim() !== "") {  // Ensure token is not empty or just whitespace
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUserId = decoded.userId;
        console.log(ownerId);
        console.log(currentUserId);
    
        conversationId = await Conversation.findOne({ 
          participants: { $all: [ownerId, currentUserId] } 
        }).select('_id').lean();
    
        conversationId = conversationId?._id || "";
        console.log(conversationId);
      } catch (error) {
        console.error("Invalid token:", error);
        return res.status(401).json({ message: "Invalid or malformed token" });
      }
    }

    // Fetch the user's data
    const user = await User.findById(ownerId);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        status: false,
      });
    }

    const owner_average_rating = await getUserAverageRating(ownerId);
    const equipment_average_rating = await getAverageRating(ownerId);
    const reviews = await getSellerReviews(ownerId);
    
    // Fetch equipment related to the user (owner_id)
         const equipments = await Equipment.find({ ownerId: ownerId, equipment_status: "Active" })
       .select('_id name make rental_price images location average_rating subCategoryId')
      .lean(); // Using lean() to return plain JS objects

    if (equipments.length === 0) {
      return res.status(200).json({
        message: 'No equipment found for this user',
        status: false,
      });
    }

    // Fetch subcategories for the equipment using helper function
    const subCategoryIds = equipments.map(equipment => equipment.subCategoryId.toString());
    const subCategoryMap = await getMultipleSubCategoryDetails(subCategoryIds);

    // Map equipment data to match the required format
    const formattedEquipments = equipments.map(equipment => {
      const subCategoryDetails = subCategoryMap[equipment.subCategoryId.toString()];
      return {
        _id: equipment._id,
        name: equipment.name,
        make: equipment.make,
        rental_price: equipment.rental_price,
        images: equipment.images,
        average_rating: equipment_average_rating,
                  location: {
            address: equipment.location?.address || "",
            lat: equipment.location?.lat || 0.0,
            lng: equipment.location?.lng || 0.0,
            range: equipment.location?.range || 0,
          },
        category_id: subCategoryDetails ? subCategoryDetails.categoryId : null,
        category_name: subCategoryDetails ? subCategoryDetails.category_name : null,
        sub_category_id: equipment.subCategoryId,
        sub_category_name: subCategoryDetails ? subCategoryDetails.sub_category_name : null,
        isFavorite: user.favorite_equipments.includes(equipment._id), // All these are favorites
        "owner": {
        _id: user._id,
        name: user.name,
        email: user.email,
        profile_image: user.profile_image,
        average_rating: owner_average_rating,
        reviews: reviews,
        },
        conversationId
      };
    });

    // Prepare the response
    const response = {
      status: true,
      message: 'User shop retrieved successfully',
      equipments: formattedEquipments,
      owner: {
        id: user._id,
        name: user.name,
        email: user.email,
        average_rating: owner_average_rating,
        profile_image: user.profile_image || '',
      },
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error('Error fetching user shop:', err);
    return res.status(500).json({
      message: 'Server error',
      status: false,
    });
  }
}


async function getFavoriteEquipments(req, res) {
  try {
    const userId = req.userId; // Assuming user ID is extracted from token middleware for authentication
    console.log('Received userId:', userId);  // Debug: Log the userId

    // Find user by ID
    const user = await User.findById(userId);

    if (!user) {
      console.log('User not found with userId:', userId);  // Debug: Log if user is not found
      return res.status(404).json({
        message: 'User not found',
        status: false,
      });
    }

    // Check if the user has favorite equipments
    if (!user.favorite_equipments || user.favorite_equipments.length === 0) {
      console.log('No favorite equipments found for user:', userId);  // Debug: Log if no favorites are found
      return res.status(200).json({
        message: 'No favorite equipments found',
        status: false,
      });
    }

    // Fetch the equipment details for the favorites
    const favoriteEquipments = await Equipment.find({ 
      _id: { $in: user.favorite_equipments }, 
      equipment_status: "Active" 
    })
    .select('_id name make rental_price images location subCategoryId ownerId')
    .populate({
      path: 'ownerId',
             model: 'User', // Ensure correct model name
      select: '_id name email profile_image' // Select required fields
    })
    .lean();
  

    if (favoriteEquipments.length === 0) {
      return res.status(200).json({
        message: 'No equipment found for favorite equipments',
        status: false,
      });
    }

    // Fetch subcategories for the equipment using helper function
    const subCategoryIds = favoriteEquipments.map(equipment => equipment.subCategoryId.toString());
    const subCategoryMap = await getMultipleSubCategoryDetails(subCategoryIds);

    //Get Equipment Average Rating
    const average_rating = await getAverageRating(favoriteEquipments);

    // Add "isFavorite" flag and additional details to each equipment
    const formattedFavoriteEquipments = favoriteEquipments.map(equipment => {
      const subCategoryDetails = subCategoryMap[equipment.subCategoryId.toString()];
      return {
        _id: equipment._id,
        name: equipment.name,
        make: equipment.make,
        rental_price: equipment.rental_price,
        images: equipment.images,
        average_rating: average_rating,
        owner: equipment.ownerId ? {
          _id: equipment.ownerId._id,
          name: equipment.ownerId.name,
          email: equipment.ownerId.email,
          profile_image: equipment.ownerId.profile_image
        } : null,
        location: {
          address: equipment.location?.address || "",
          lat: equipment.location?.lat || 0.0,
          lng: equipment.location?.lng || 0.0,
          range: equipment.location?.range || 0,
        },
        category_id: subCategoryDetails ? subCategoryDetails.categoryId : null,
        category_name: subCategoryDetails ? subCategoryDetails.category_name : null,
        sub_category_id: equipment.subCategoryId,
        sub_category_name: subCategoryDetails ? subCategoryDetails.sub_category_name : null,
        isFavorite: user.favorite_equipments.includes(equipment._id), // All these are favorites
      };
    });

    return res.status(200).json({
      message: 'Favorite equipments retrieved successfully',
      status: true,
      favoriteEquipments: formattedFavoriteEquipments,
    });
  } catch (err) {
    console.error('Error retrieving favorite equipments:', err);
    return res.status(500).json({
      message: 'Server error',
      status: false,
    });
  }
}

async function toggleFavorite(req, res) {
  try {
    const userId = req.userId; // Assuming user ID is extracted from token middleware for authentication
    const equipmentId = req.query.equipmentId; // Equipment ID from the request body

    // Find the user by ID
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        status: false,
      });
    }

    // Check if equipment is already in the user's favorites
    if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
      return res.status(400).json({ message: 'Invalid equipment ID', status: false });
    }
    
    const isFavorite = user.favorite_equipments.includes(equipmentId);

    if (isFavorite) {
      // Remove equipment from favorites if it exists
      user.favorite_equipments = user.favorite_equipments.filter(id => id.toString() !== equipmentId);
    } else {
      // Add equipment to favorites if it doesn't exist
      user.favorite_equipments.push(equipmentId);
    }

    // Save the user with updated favorite equipments list
    await user.save();

    // Return success response
    return res.status(200).json({
      message: isFavorite ? 'Equipment removed from favorites' : 'Equipment added to favorites',
      status: true,
    });
  } catch (err) {
    console.error('Error toggling favorite status:', err);
    return res.status(500).json({
      message: 'Server error',
      status: false,
    });
  }
}

async function updateEquipmentStatus(req, res) {
  await Equipment.updateMany({}, { $unset: { isLive: 1 } });
  try {
    const { equipmentId, status, reason } = req.query;
    if (!equipmentId || !status) return res.status(400).json({ message: "Equipment ID and status are required." });

    const validTransitions = {
      Pending: ["Active", "Rejected", "Blocked"],
      Active: ["InActive", "Blocked"],
      InActive: ["Active", "Blocked"],
      Blocked: ["Active"],
      Rejected: ["Active"]
    };

    const requiresReason = ["Rejected", "Blocked"];
    if (requiresReason.includes(status) && !reason) return res.status(400).json({ message: `${status} reason is required.` });

    const equipment = await Equipment.findById(equipmentId);
    if (!equipment) return res.status(404).json({ message: "Equipment not found." });

    if (!validTransitions[equipment.equipment_status]?.includes(status)) {
      return res.status(400).json({ message: `Cannot change status from ${equipment.equipment_status} to ${status}.` });
    }

    // ✅ Update only the required fields
    const oldStatus = equipment.equipment_status; // Store old status for comparison
    equipment.equipment_status = status;
    equipment.reason = requiresReason.includes(status) ? reason : "";

    // ✅ Validate only modified fields to avoid schema errors
    await equipment.save({ validateModifiedOnly: true });

    // 🔔 Send socket event to equipment owner about status change
    const socketEventData = {
      equipmentId: equipment._id,
      equipment_name: equipment.name,
      old_status: oldStatus,
      new_status: status,
      reason: equipment.reason,
      updated_at: new Date(),
      message: `Your equipment "${equipment.name}" status has been changed from ${oldStatus} to ${status}`,
      notification_type: 'equipment_status_update'
    };

    // Send event to equipment owner
    sendEventToUser(equipment.ownerId.toString(), 'equipmentStatusChanged', socketEventData);

    return res.status(200).json({ message: `Equipment status updated to ${status}`, status: true, equipment });

  } catch (error) {
    console.error("❌ Error updating equipment status:", error);
    return res.status(500).json({ message: "Failed to update equipment status" });
  }
}


///////////////////Admin//////////////////////////

// Get equipment by status
async function getEquipmentByStatus(req, res) {
  try {
    console.log("🔹 getEquipmentByStatus API called");
    const { status = 'all' } = req.query;
    console.log("🔹 Requested status:", status);
    
    // Validate status
    const validStatuses = ['pending', 'rejected', 'inactive', 'active', 'blocked', 'all'];
    const normalizedStatus = status.toLowerCase();
    console.log("🔹 Normalized status:", normalizedStatus);
    
    if (!validStatuses.includes(normalizedStatus)) {
      console.log("🔴 Invalid status provided:", normalizedStatus);
      return res.status(400).json({
        message: 'Invalid status',
        validStatuses: validStatuses
      });
    }
    
    // Build query based on status
    let query = {};
    if (normalizedStatus !== 'all') {
      query.equipment_status = normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
      console.log("🔹 Query status:", query.equipment_status);
    }

    // Get equipment with owner details
    console.log("🔹 Fetching equipment with query:", query);
    const equipments = await Equipment.find(query)
      .populate('ownerId', 'name email profile_image')
      .populate('subCategoryId', 'name')
      .populate({
        path: 'subCategoryId',
        populate: {
          path: 'categoryId',
          select: 'name'
        }
      });
    console.log(`🔹 Found ${equipments.length} equipment`);

    // Get rental counts for each equipment
    console.log("🔹 Getting rental stats for each equipment");
    const equipmentsWithStats = await Promise.all(equipments.map(async (equipment) => {
      
      // Check if equipment is booked by looking for active orders
      const activeOrderStatuses = ['Delivered', 'Ongoing', 'Returned', 'Late'];
      const isBooked = await Order.exists({
        equipmentId: equipment._id,
        rental_status: { $in: activeOrderStatuses }
      });
      
      return {
        _id: equipment._id,
        name: equipment.name,
        make: equipment.make,
        model: equipment.model,
        serial_number: equipment.serial_number,
        description: equipment.description,
        images: equipment.images,
        category: equipment.subCategoryId?.categoryId?.name || 'Unknown',
        sub_category: equipment.subCategoryId?.name || 'Unknown',
        postal_code: equipment.postal_code,
        delivery_by_owner: equipment.delivery_by_owner,
        rental_price: equipment.rental_price,
        equipment_price: equipment.equipment_price,
        location: equipment.location,
        owner: equipment.ownerId ? {
          _id: equipment.ownerId._id,
          name: equipment.ownerId.name,
          email: equipment.ownerId.email,
          profile_image: equipment.ownerId.profile_image
        } : null,
        status: equipment.equipment_status,
        isBooked: !!isBooked, // Convert to boolean
        created_at: equipment.createdAt
      };
    }));

    console.log("🔹 Sending response with equipment data");
    res.status(200).json({
      message: 'Equipment fetched successfully',
      equipments: equipmentsWithStats
    });
  } catch (error) {
    console.error("🔴 Error in getEquipmentByStatus:", error);
    res.status(500).json({ message: 'Error fetching equipment', error });
  }
};

// Search equipment based on text query
async function searchEquipment(req, res) {
  try {
    const { text } = req.query;
    if (!text) {
      return res.status(400).json({ message: 'Search text is required' });
    }
    const searchPattern = new RegExp(text, 'i');
    const orQuery = [
      { name: { $regex: searchPattern } },
      { model: { $regex: searchPattern } },
      { serial_number: { $regex: searchPattern } },
      { make: { $regex: searchPattern } }
    ];
    if (mongoose.Types.ObjectId.isValid(text)) {
      orQuery.push({ _id: text });
      orQuery.push({ ownerId: text });
    }
    // Find all equipment matching text fields or exact id/owner_id
    let equipments = await Equipment.find({ $or: orQuery })
      .populate('ownerId', 'name email profile_image')
      .populate('subCategoryId', 'name')
      .populate({
        path: 'subCategoryId',
        populate: {
          path: 'categoryId',
          select: 'name'
        }
      });
    // If not an exact ObjectId, also filter for partial _id and owner_id match
    if (!mongoose.Types.ObjectId.isValid(text)) {
      const textLower = text.toLowerCase();
      const allEquipments = await Equipment.find()
        .populate('ownerId', 'name email profile_image')
        .populate('subCategoryId', 'name')
        .populate({
          path: 'subCategoryId',
          populate: {
            path: 'categoryId',
            select: 'name'
          }
        });
      const filtered = allEquipments.filter(e =>
        e._id.toString().toLowerCase().includes(textLower) ||
        (e.ownerId && e.ownerId._id && e.ownerId._id.toString().toLowerCase().includes(textLower))
      );
      // Merge and deduplicate
      const ids = new Set(equipments.map(e => e._id.toString()));
      filtered.forEach(e => {
        if (!ids.has(e._id.toString())) equipments.push(e);
      });
    }
    // Format the response
    const formattedEquipments = equipments.map(equipment => ({
      _id: equipment._id,
      name: equipment.name,
      make: equipment.make,
      model: equipment.model,
      serial_number: equipment.serial_number,
      description: equipment.description,
      images: equipment.images,
      category: equipment.subCategoryId?.categoryId?.name || 'Unknown',
      sub_category: equipment.subCategoryId?.name || 'Unknown',
      postal_code: equipment.postal_code,
      delivery_by_owner: equipment.delivery_by_owner,
      rental_price: equipment.rental_price,
      equipment_price: equipment.equipment_price,
      location: equipment.location,
      owner: equipment.ownerId ? {
        _id: equipment.ownerId._id,
        name: equipment.ownerId.name,
        email: equipment.ownerId.email,
        profile_image: equipment.ownerId.profile_image
      } : null,
      status: equipment.equipment_status,
      created_at: equipment.createdAt
    }));
    res.status(200).json({ message: 'Equipment fetched successfully', equipments: formattedEquipments });
  } catch (error) {
    console.error("🔴 Error in searchEquipment:", error);
    res.status(500).json({ message: 'Error searching equipment', error });
  }
}

module.exports = {
  addEquipment,
  updateEquipment,
  getAllEquipments,
  getEquipmentDetails,
  deleteEquipment,
  getRandomEquipmentImages,
  getUserShop,
  getFavoriteEquipments,
  toggleFavorite,
  updateEquipmentStatus,
  getMyEquipments,
  getEquipmentByStatus,
  searchEquipment
};
