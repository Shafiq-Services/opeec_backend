const mongoose = require('mongoose');
const Equipment = require('../models/equipment'); // Import the Equipment model
const User = require('../models/User'); // Import the User model (for owner validation)
const SubCategory = require('../models/sub_categories'); // Import the SubCategory model
const categories = require('../models/categories'); // Import the categories model
const Conversation = require('../models/conversation');
const jwt = require('jsonwebtoken');  // Import jsonwebtoken
const { getAverageRating, getEquipmentRatingsList, getUserAverageRating } = require("../utils/common_methods");

const addEquipment = async (req, res) => {
  const {
    sub_category_fk,
    name,
    make,
    model,
    serial_number,
    description,
    images,
    address,
    lat,
    long,
    range,
    delivery_by_owner, // Required field
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
      { name: 'sub_category_fk', value: sub_category_fk },
      { name: 'name', value: name },
      { name: 'make', value: make },
      { name: 'model', value: model },
      { name: 'serial_number', value: serial_number },
      { name: 'description', value: description },
      { name: 'address', value: address },
      { name: 'lat', value: lat },
      { name: 'long', value: long },
      { name: 'rental_price', value: rental_price },
      { name: 'equipment_price', value: equipment_price },
      { name: 'notice_period', value: notice_period },
      { name: 'minimum_trip_duration', value: minimum_trip_duration },
      { name: 'maximum_trip_duration', value: maximum_trip_duration }
    ];

    // Include range validation only if delivery_by_owner is true
    if (isDeliveryByOwner) {
      requiredFields.push({ name: 'range', value: range });
    }

    for (const field of requiredFields) {
      if (field.value === undefined || field.value === null || field.value === "") {
        return res.status(400).json({ message: `${field.name} is required.` });
      }
    }

    // Validate range only if delivery_by_owner is true
    if (isDeliveryByOwner && (isNaN(range) || range < 0)) {
      return res.status(400).json({ message: 'Range must be a non-negative number.' });
    }

    // Validate image constraints safely
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: 'At least one image is required.' });
    }
    if (images.length > 3) {
      return res.status(400).json({ message: 'A maximum of 3 images are allowed.' });
    }

    // Validate sub-category existence
    const subCategory = await SubCategory.findById(sub_category_fk);
    if (!subCategory) return res.status(404).json({ message: 'Sub-category not found.' });

    // Create and save equipment
    const newEquipment = new Equipment({
      owner_id: req.userId,
      sub_category_fk,
      name,
      make,
      model,
      serial_number,
      description,
      images,
      custom_location: {
        address,
        lat,
        long,
        ...(isDeliveryByOwner ? { range } : {}) // Include range only if required
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
        sub_category_fk,
        name,
        make,
        model,
        serial_number,
        description,
        images,
        address,
        lat,
        long,
        range,
        delivery_by_owner,
        rental_price,
        equipment_price,
        notice_period,
        minimum_trip_duration,
        maximum_trip_duration,
    } = req.body;
    
    try {
        const equipmentId = req.query.equipment_id; // Get the equipment ID from the request params
        const userId = req.userId; // Assuming user ID is extracted from token middleware for authentication

        // Validate required fields
        const requiredFields = [
            { name: 'sub_category_fk', value: sub_category_fk },
            { name: 'name', value: name },
            { name: 'make', value: make },
            { name: 'model', value: model },
            { name: 'serial_number', value: serial_number },
            { name: 'description', value: description },
            { name: 'address', value: address },
            { name: 'lat', value: lat },
            { name: 'long', value: long },
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
        const subCategory = await SubCategory.findById(sub_category_fk);
        if (!subCategory) return res.status(404).json({ message: 'Sub-category not found.' });

        // Find the existing equipment by ID
        const equipment = await Equipment.findById(equipmentId);
        if (!equipment) return res.status(404).json({ message: 'Equipment not found.' });

        // Replace images instead of adding them
        if (images) {
            equipment.images = images; // Replace existing images with new ones
        }

        // Update the other fields
        equipment.sub_category_fk = sub_category_fk;
        equipment.name = name;
        equipment.make = make;
        equipment.model = model;
        equipment.serial_number = serial_number;
        equipment.description = description;
        equipment.custom_location = { address, lat, long, range };
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
  try {
    const { lat, long, distance, name, category_id, delivery_by_owner } = req.query;

    // ✅ Validate required parameters
    if (!lat || !long) {
      return res.status(400).json({ message: "Latitude and longitude are required." });
    }

    let query = {};

    // ✅ Exclude equipment owned by the logged-in user if token is provided
    if (req.user && req.user._id) {
      query.owner_id = { $ne: req.user._id };
    }

    // ✅ Optional filters
    if (name) {
      query.name = { $regex: name, $options: "i" }; // Case-insensitive search
    }

    if (delivery_by_owner !== undefined) {
      query.delivery_by_owner = delivery_by_owner === "true";
    }

    if (category_id) {
      const subCategories = await SubCategory.find({ category_id });
      const subCategoryIds = subCategories.map(subCat => subCat._id);
      query.sub_category_fk = { $in: subCategoryIds };
    }

    // ✅ Geospatial filtering
    let geoPipeline = [];
    if (parseFloat(lat) !== 0.0 || parseFloat(long) !== 0.0) {
      const maxDistanceKm = distance ? parseFloat(distance) : 50; // Default to 50km

      geoPipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: [parseFloat(long), parseFloat(lat)] },
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
          coordinates: ["$custom_location.long", "$custom_location.lat"],
        },
      },
    });

    // ✅ Fetch filtered equipment
    const equipments = await Equipment.aggregate(geoPipeline);

    // ✅ Fetch subcategories and categories
    const subCategoryIds = equipments.map(equipment => equipment.sub_category_fk);
    const subCategories = await SubCategory.find({ _id: { $in: subCategoryIds } }).populate("category_id");

    // ✅ Map subcategory details
    const subCategoryMap = subCategories.reduce((acc, subCat) => {
      acc[subCat._id] = {
        sub_category_name: subCat.name,
        category_id: subCat.category_id._id,
        category_name: subCat.category_id.name,
      };
      return acc;
    }, {});

    // ✅ Format response
    const formattedEquipments = await Promise.all(
      equipments.map(async (equipment) => {
        const subCategoryDetails = subCategoryMap[equipment.sub_category_fk];
    
        // Fetch category asynchronously
        const subCategory = await SubCategory.findById(equipment.sub_category_fk);
        const category = await categories.findById(subCategory.category_id);
        const owner = await User.findById(equipment.owner_id);

        return {
          _id: equipment._id,
          average_rating: await getAverageRating(equipment._id),
          created_at: equipment.created_at ? equipment.created_at.toGMTString() : new Date().toGMTString(),
          delivery_by_owner: equipment.delivery_by_owner,
          description: equipment.description,
          equipment_price: equipment.equipment_price,
          images: equipment.images,
          isFavorite: owner.favorite_equipments.includes(equipment._id), // All these are favorites
          location: {
            address: equipment.custom_location?.address || "",
            lat: equipment.custom_location?.lat || 0.0,
            long: equipment.custom_location?.long || 0.0,
            range: equipment.custom_location?.range || 0,
          },
          make: equipment.make,
          maximum_trip_duration: equipment.maximum_trip_duration,
          minimum_trip_duration: equipment.minimum_trip_duration,
          model: equipment.model,
          name: equipment.name,
          notice_period: equipment.notice_period,
          owner_id: equipment.owner_id,
          postal_code: equipment.postal_code,
          rental_price: equipment.rental_price,
          serial_number: equipment.serial_number,
          sub_category_id: equipment.sub_category_fk._id,
          sub_category_name: equipment.sub_category_fk.name,
          category_id: category ? category._id : null, // ✅ Fixed category reference
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
      owner_id: userId,
      ...(equipment_status !== "All" && { equipment_status }),
    }).populate("sub_category_fk");
    

    // ✅ Fetch subcategories and categories
    const subCategoryIds = equipments.map(equipment => equipment.sub_category_fk);
    const subCategories = await SubCategory.find({ _id: { $in: subCategoryIds } }).populate("category_id");

    // ✅ Map subcategory details
    // const subCategoryMap = subCategories.reduce((acc, subCat) => {
    //   acc[subCat._id] = {
    //     sub_category_name: subCat.name,
    //     category_id: subCat.category_id._id,
    //   };
    //   return acc;
    // }, {});

    // ✅ Format response
    const formattedEquipments = await Promise.all(
      equipments.map(async (equipment) => {
        // const subCategoryDetails = subCategoryMap[equipment.sub_category_fk];
    
        // Fetch category asynchronously
        const subCategory = await SubCategory.findById(equipment.sub_category_fk);
        const category = await categories.findById(subCategory.category_id);
        const owner = await User.findById(equipment.owner_id);

        return {
          _id: equipment._id,
          average_rating: await getAverageRating(equipment._id),
          created_at: equipment.created_at ? equipment.created_at.toGMTString() : new Date().toGMTString(),
          delivery_by_owner: equipment.delivery_by_owner,
          description: equipment.description,
          equipment_price: equipment.equipment_price,
          images: equipment.images,
          isFavorite: owner.favorite_equipments.includes(equipment._id), // All these are favorites
          location: {
            address: equipment.custom_location?.address || "",
            lat: equipment.custom_location?.lat || 0.0,
            long: equipment.custom_location?.long || 0.0,
            range: equipment.custom_location?.range || 0,
          },
          make: equipment.make,
          maximum_trip_duration: equipment.maximum_trip_duration,
          minimum_trip_duration: equipment.minimum_trip_duration,
          model: equipment.model,
          name: equipment.name,
          notice_period: equipment.notice_period,
          owner_id: equipment.owner_id,
          postal_code: equipment.postal_code,
          rental_price: equipment.rental_price,
          serial_number: equipment.serial_number,
          sub_category_id: equipment.sub_category_fk._id,
          sub_category_name: equipment.sub_category_fk.name,
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
      const owner = await User.findById(equipment.owner_id, 'name profile_image');
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
        created_at: equipment.created_at ? equipment.created_at.toGMTString() : new Date().toGMTString(),
        delivery_by_owner: equipment.delivery_by_owner || false,
        description: equipment.description || '',
        equipment_price: equipment.equipment_price || 0,
        images: equipment.images || [],
        equipment_status: equipment.equipment_status,
        location: {
          address: equipment.custom_location?.address || '',
          lat: equipment.custom_location?.lat || 0.0,
          long: equipment.custom_location?.long || 0.0,
          range: equipment.custom_location?.range || 0,
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
        sub_category_fk: equipment.sub_category_fk || '',
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
      const equipmentId = req.query.equipment_id; // Extract equipment ID from request parameters
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
      // Fetch all live equipment with populated categories and owner details
      const equipments = await Equipment.find({ equipment_status: "Active" })
        .populate({
          path: 'sub_category_fk',
          model: SubCategory, // Reference to SubCategory model
          populate: {
            path: 'category_id',
            model: categories, // Reference to Category model
          },
        })
        .populate({
          path: 'owner_id',
          model: User, // Reference to User model
          select: '_id name email profile_image' // Selecting only necessary fields
        });
  
      if (!equipments || equipments.length === 0) {
        return res.status(200).json({
          message: 'No equipment found',
          status: false,
        });
      }
  
      const categoryMap = {};
      const result = [];
      const usedEquipmentIds = new Set();
  
      // Group equipment by categories
      equipments.forEach((equipment) => {
        const categoryId = equipment.sub_category_fk.category_id._id.toString();
        if (!categoryMap[categoryId]) {
          categoryMap[categoryId] = [];
        }
        categoryMap[categoryId].push(equipment);
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
              equipment_id: equipment._id,
              image: randomImage,
              owner: equipment.owner_id
                ? {
                    _id: equipment.owner_id._id,
                    name: equipment.owner_id.name,
                    email: equipment.owner_id.email,
                    profile_image: equipment.owner_id.profile_image,
                  }
                : null,
            });
  
            usedEquipmentIds.add(equipment._id.toString());
          }
  
          if (result.length === 20) break;
        }
  
        // If all categories are exhausted, allow repeating equipment
        if (result.length < 20 && usedEquipmentIds.size === equipments.length) {
          break;
        }
      }
  
      // Fill up to 20 results if fewer than 20 images were added
      while (result.length < 20) {
        const randomEquipment =
          equipments[Math.floor(Math.random() * equipments.length)];
        const randomImage =
          randomEquipment.images[
            Math.floor(Math.random() * randomEquipment.images.length)
          ];
        result.push({
          equipment_id: randomEquipment._id,
          image: randomImage,
          owner: randomEquipment.owner_id
            ? {
                _id: randomEquipment.owner_id._id,
                name: randomEquipment.owner_id.name,
                email: randomEquipment.owner_id.email,
                profile_image: randomEquipment.owner_id.profile_image,
              }
            : null,
        });
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
    const ownerId = req.query.owner_id;
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

    // Fetch equipment related to the user (owner_id)
    const equipments = await Equipment.find({ owner_id: ownerId, equipment_status: "Active" })
      .select('_id name make rental_price images location average_rating sub_category_fk custom_location')
      .lean(); // Using lean() to return plain JS objects

    if (equipments.length === 0) {
      return res.status(200).json({
        message: 'No equipment found for this user',
        status: false,
      });
    }

    // Fetch subcategories for the equipment
    const subCategoryIds = equipments.map(equipment => equipment.sub_category_fk);
    const subCategories = await SubCategory.find({ _id: { $in: subCategoryIds } }).populate('category_id');

    // Map subcategories to equipment data
    const subCategoryMap = subCategories.reduce((acc, subCat) => {
      acc[subCat._id] = {
        sub_category_name: subCat.name,
        category_id: subCat.category_id._id,
        category_name: subCat.category_id.name,
      };
      return acc;
    }, {});

    // Map equipment data to match the required format
    const formattedEquipments = equipments.map(equipment => {
      const subCategoryDetails = subCategoryMap[equipment.sub_category_fk];
      return {
        _id: equipment._id,
        name: equipment.name,
        make: equipment.make,
        rental_price: equipment.rental_price,
        images: equipment.images,
        average_rating: equipment_average_rating,
        location: {
          address: equipment.custom_location?.address || "",
          lat: equipment.custom_location?.lat || 0.0,
          long: equipment.custom_location?.long || 0.0,
          range: equipment.custom_location?.range || 0,
        },
        category_id: subCategoryDetails ? subCategoryDetails.category_id : null,
        category_name: subCategoryDetails ? subCategoryDetails.category_name : null,
        sub_category_id: equipment.sub_category_fk,
        sub_category_name: subCategoryDetails ? subCategoryDetails.sub_category_name : null,
        isFavorite: user.favorite_equipments.includes(equipment._id), // All these are favorites
        "owner": {
        _id: user._id,
        name: user.name,
        email: user.email,
        profile_image: user.profile_image,
        average_rating: owner_average_rating,
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
    .select('_id name make rental_price images location sub_category_fk owner_id')
    .populate({
      path: 'owner_id',
      model: 'users', // Ensure correct model name
      select: '_id name email profile_image' // Select required fields
    })
    .lean();
  

    if (favoriteEquipments.length === 0) {
      return res.status(200).json({
        message: 'No equipment found for favorite equipments',
        status: false,
      });
    }

    // Fetch subcategories for the equipment
    const subCategoryIds = favoriteEquipments.map(equipment => equipment.sub_category_fk);
    const subCategories = await SubCategory.find({ _id: { $in: subCategoryIds } }).populate('category_id');

    //Get Equipment Average Rating
    const average_rating = await getAverageRating(favoriteEquipments);

    // Map subcategories to equipment data
    const subCategoryMap = subCategories.reduce((acc, subCat) => {
      acc[subCat._id] = {
        sub_category_name: subCat.name,
        category_id: subCat.category_id._id,
        category_name: subCat.category_id.name,
      };
      return acc;
    }, {});

    // Add "isFavorite" flag and additional details to each equipment
    const formattedFavoriteEquipments = favoriteEquipments.map(equipment => {
      const subCategoryDetails = subCategoryMap[equipment.sub_category_fk];
      return {
        _id: equipment._id,
        name: equipment.name,
        make: equipment.make,
        rental_price: equipment.rental_price,
        images: equipment.images,
        average_rating: average_rating,
        owner: equipment.owner_id ? {
          _id: equipment.owner_id._id,
          name: equipment.owner_id.name,
          email: equipment.owner_id.email,
          profile_image: equipment.owner_id.profile_image
        } : null,
        location: {
          address: equipment.custom_location?.address || "",
          lat: equipment.custom_location?.lat || 0.0,
          long: equipment.custom_location?.long || 0.0,
          range: equipment.custom_location?.range || 0,
        },
        category_id: subCategoryDetails ? subCategoryDetails.category_id : null,
        category_name: subCategoryDetails ? subCategoryDetails.category_name : null,
        sub_category_id: equipment.sub_category_fk,
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
    const { equipment_id, status, reason } = req.query;
    if (!equipment_id || !status) return res.status(400).json({ message: "Equipment ID and status are required." });

    const validTransitions = {
      Pending: ["Active", "Rejected", "Blocked"],
      Active: ["InActive", "Blocked"],
      InActive: ["Active", "Blocked"],
      Blocked: ["Active"]
    };

    const requiresReason = ["Rejected", "Blocked"];
    if (requiresReason.includes(status) && !reason) return res.status(400).json({ message: `${status} reason is required.` });

    const equipment = await Equipment.findById(equipment_id);
    if (!equipment) return res.status(404).json({ message: "Equipment not found." });

    if (!validTransitions[equipment.equipment_status]?.includes(status)) {
      return res.status(400).json({ message: `Cannot change status from ${equipment.equipment_status} to ${status}.` });
    }

    // ✅ Update only the required fields
    equipment.equipment_status = status;
    equipment.reason = requiresReason.includes(status) ? reason : "";

    // ✅ Validate only modified fields to avoid schema errors
    await equipment.save({ validateModifiedOnly: true });

    return res.status(200).json({ message: `Equipment status updated to ${status}`, status: true, equipment });

  } catch (error) {
    console.error("❌ Error updating equipment status:", error);
    return res.status(500).json({ message: "Failed to update equipment status" });
  }
}

async function updateEquipmentStatus(req, res) {
  try {
    const { equipmentId, status } = req.query;

    // Validate equipment ID
    if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
      return res.status(400).json({ message: 'Invalid equipment ID', status: false });
    }

    // Validate status
    const validStatuses = ['Pending', 'Rejected', 'InActive', 'Active', 'Blocked'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status', status: false });
    }

    // Find and update the equipment status
    const updatedEquipment = await Equipment.findByIdAndUpdate(
      equipmentId,
      { equipment_status: status },
      { new: true }
    );

    if (!updatedEquipment) {
      return res.status(404).json({ message: 'Equipment not found', status: false });
    }

    return res.status(200).json({
      message: 'Equipment status updated successfully',
      status: true,
      equipment: updatedEquipment,
    });
  } catch (err) {
    console.error('Error updating equipment status:', err);
    return res.status(500).json({ message: 'Server error', status: false });
  }
}

module.exports = { addEquipment, updateEquipment, getAllEquipments, getEquipmentDetails, deleteEquipment, getRandomEquipmentImages, getUserShop, getFavoriteEquipments,  toggleFavorite, updateEquipmentStatus, getMyEquipments, updateEquipmentStatus};
