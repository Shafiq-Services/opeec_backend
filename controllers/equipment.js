const mongoose = require('mongoose');
const Equipment = require('../models/equipment');
const User = require('../models/user');
const Category = require('../models/categories');
const Conversation = require('../models/conversation');
const jwt = require('jsonwebtoken');
const { getAverageRating, getEquipmentRatingsList, getUserAverageRating, getSellerReviews} = require("../utils/common_methods");
const Order = require('../models/orders');
const { sendEventToUser } = require('../utils/socketService');
const { createAdminNotification } = require('./adminNotificationController');
const { getDurationDetails } = require('../utils/feeCalculations');
const EquipmentDropdown = require('../models/equipmentDropDown');

/**
 * When client sends type string (e.g. "day") as dropdownId instead of ObjectId, resolve to the real dropdown _id.
 * @param {string} dropdownName - 'advanceNotice' | 'minimumRentalDuration' | 'maximumRentalDuration'
 * @param {string} typeOrId - Either an ObjectId string or a unit type like "day", "days", "hour", "week"
 * @param {number} selectedValue
 * @returns {Promise<{ dropdownId: ObjectId, selectedValue: number }|null>}
 */
async function resolveDurationRefForUpdate(dropdownName, typeOrId, selectedValue) {
  const val = typeOrId != null ? String(typeOrId).trim() : '';
  const selected = selectedValue != null ? Number(selectedValue) : 0;
  // Already a valid 24-char hex ObjectId: use as-is
  if (val.length === 24 && /^[a-fA-F0-9]{24}$/.test(val)) {
    return { dropdownId: new mongoose.Types.ObjectId(val), selectedValue: selected };
  }
  // Client sent unit string (e.g. "day", "hour"): resolve to EquipmentDropdown _id
  const unitMap = {
    day: 'days', days: 'days',
    hour: 'hours', hours: 'hours',
    week: 'weeks', weeks: 'weeks',
    month: 'months', months: 'months',
  };
  const unit = unitMap[val.toLowerCase()] || 'days';
  const dropdown = await EquipmentDropdown.findOne({ name: dropdownName, unit }).lean();
  if (!dropdown) return null;
  return {
    dropdownId: new mongoose.Types.ObjectId(dropdown._id.toString()),
    selectedValue: selected,
  };
}

/**
 * Resolve duration ref (dropdownId + selectedValue) to { type, count, label } for API responses.
 * If ref already has type/count (legacy), return it; otherwise resolve via dropdown.
 */
async function resolveDuration(durationRef) {
  if (!durationRef) return { type: '', count: 0, label: '' };
  if (durationRef.type !== undefined && durationRef.type !== '') {
    return {
      type: durationRef.type || '',
      count: durationRef.count ?? 0,
      label: durationRef.label || `${durationRef.count ?? 0} ${durationRef.type || ''}`
    };
  }
  const resolved = await getDurationDetails(durationRef);
  return { type: resolved.type || '', count: resolved.count ?? 0, label: resolved.label || '' };
}

/** Haversine distance in km between two lat/lng points. */
function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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

// Ensure API always returns images as an array of non-empty strings (handles legacy single string or mixed data)
function normalizeImageUrls(value) {
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item.url === 'string') return item.url.trim();
      return null;
    })
    .filter(Boolean);
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

// Helper function to get reservation text for equipment
async function getReservationText(equipmentId) {
  try {
    // Active rental statuses that mean equipment is reserved
    const activeOrderStatuses = ['Booked', 'Delivered', 'Ongoing', 'Late'];
    
    // Find active order for this equipment
    const activeOrder = await Order.findOne({
      equipmentId: equipmentId,
      rental_status: { $in: activeOrderStatuses }
    })
    .sort({ 'rental_schedule.end_date': -1 }) // Get the latest ending reservation
    .select('rental_schedule.end_date');
    
    if (!activeOrder || !activeOrder.rental_schedule || !activeOrder.rental_schedule.end_date) {
      return ''; // Not reserved
    }
    
    const endDate = new Date(activeOrder.rental_schedule.end_date);
    const currentDate = new Date();
    
    // ✅ Only show reservation text if the end date is in the FUTURE
    if (endDate <= currentDate) {
      return ''; // Reservation has ended (past date), don't show text
    }
    
    // Format the date as "Reserved till HH:MM - DD/MM/YY" using UTC so the
    // displayed date matches the stored calendar date regardless of server TZ
    const hours = String(endDate.getUTCHours()).padStart(2, '0');
    const minutes = String(endDate.getUTCMinutes()).padStart(2, '0');
    const day = String(endDate.getUTCDate()).padStart(2, '0');
    const month = String(endDate.getUTCMonth() + 1).padStart(2, '0');
    const year = String(endDate.getUTCFullYear()).slice(-2);

    return `Reserved till ${hours}:${minutes} - ${day}/${month}/${year}`;
  } catch (error) {
    console.error('Error getting reservation text:', error);
    return '';
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
    const userId = req.userId; // JWT user ID
    
    // 🔒 VERIFICATION CHECK: Prevent non-verified users from adding equipment
    const user = await User.findById(userId).select('stripe_verification name');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const verificationStatus = user.stripe_verification?.status || 'not_verified';
    
    if (verificationStatus !== 'verified') {
      return res.status(403).json({ 
        message: 'Identity verification required to list equipment',
        error_code: 'verification_required_for_equipment',
        verification_status: verificationStatus,
        require_verification: true,
        verification_url: '/user/verification/initiate',
        user_guidance: 'Please complete identity verification before listing equipment for rent'
      });
    }

    console.log(`✅ Verified user ${user.name} (${userId}) adding equipment: ${name}`);

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

    // Get user details for notification
    const owner = await User.findById(req.userId).select('name email');

    // Send admin notification for new equipment submission
    await createAdminNotification(
      'equipment_submission',
      `New equipment "${name}" submitted by ${owner.name} for approval`,
      {
        userId: req.userId,
        equipmentId: savedEquipment._id,
        data: {
          equipmentName: name,
          ownerName: owner.name,
          ownerEmail: owner.email,
          category: subCategory.categoryName,
          subcategory: subCategory.name,
          submissionDate: new Date()
        }
      }
    );

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

        // Track the previous status before any changes
        const previousStatus = equipment.equipment_status;

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

        // Resolve duration refs: client may send type string ("day", "hour") as dropdownId; backend needs ObjectId
        const [resolvedNotice, resolvedMinTrip, resolvedMaxTrip] = await Promise.all([
          resolveDurationRefForUpdate('advanceNotice', notice_period?.dropdownId, notice_period?.selectedValue),
          resolveDurationRefForUpdate('minimumRentalDuration', minimum_trip_duration?.dropdownId, minimum_trip_duration?.selectedValue),
          resolveDurationRefForUpdate('maximumRentalDuration', maximum_trip_duration?.dropdownId, maximum_trip_duration?.selectedValue),
        ]);
        if (!resolvedNotice || !resolvedMinTrip || !resolvedMaxTrip) {
          return res.status(400).json({
            message: 'Invalid duration configuration. Ensure advance notice, minimum and maximum trip durations use valid units (e.g. day, hour, week).',
          });
        }
        equipment.set('notice_period', { dropdownId: resolvedNotice.dropdownId, selectedValue: resolvedNotice.selectedValue });
        equipment.set('minimum_trip_duration', { dropdownId: resolvedMinTrip.dropdownId, selectedValue: resolvedMinTrip.selectedValue });
        equipment.set('maximum_trip_duration', { dropdownId: resolvedMaxTrip.dropdownId, selectedValue: resolvedMaxTrip.selectedValue });

        // Set status to Pending for re-review (Active or Rejected equipment needs admin approval)
        if (previousStatus === 'Active' || previousStatus === 'Rejected') {
            equipment.equipment_status = 'Pending';
            equipment.reason = ''; // Clear any previous rejection reason
        }

        // Save the updated equipment
        const updatedEquipment = await equipment.save();

        // Send admin notification for ALL equipment edits that need review
        if (previousStatus === 'Active' || previousStatus === 'Rejected') {
            const owner = await User.findById(userId).select('name email');

            const notificationType = previousStatus === 'Rejected' ? 'equipment_resubmission' : 'equipment_updated';
            const notificationMessage = previousStatus === 'Rejected' 
                ? `Equipment "${name}" resubmitted by ${owner.name} after rejection`
                : `Equipment "${name}" was edited by ${owner.name} (moved to Pending for review)`;

            await createAdminNotification(
                notificationType,
                notificationMessage,
                {
                    userId: userId,
                    equipmentId: updatedEquipment._id,
                    data: {
                        equipmentName: name,
                        ownerName: owner.name,
                        ownerEmail: owner.email,
                        category: subCategory.categoryName,
                        subcategory: subCategory.name,
                        previousStatus: previousStatus,
                        newStatus: updatedEquipment.equipment_status,
                        editDate: new Date()
                    }
                }
            );
        }

        const statusChangeMessage = (previousStatus === 'Active' || previousStatus === 'Rejected')
            ? ' Equipment moved to Pending for admin review.'
            : '';
        
        res.status(200).json({ 
            message: `Equipment updated successfully.${statusChangeMessage}`, 
            data: updatedEquipment,
            status_changed: previousStatus !== updatedEquipment.equipment_status,
            previous_status: previousStatus,
            new_status: updatedEquipment.equipment_status
        });

    } catch (error) {
        console.error('Error updating equipment:', error);
        res.status(500).json({ message: 'Error updating equipment.', error: error.message });
    }
};

async function getAllEquipments(req, res) {
  // Safely extract userId from token - wrapped in try-catch to prevent crashes
  let userId = null;
  try {
    if (req.headers.authorization) {
      const token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.userId;
    }
  } catch (tokenError) {
    // Invalid token - continue without userId (public access)
    console.warn('Invalid token in getAllEquipments, continuing without userId:', tokenError.message);
  }

  try {
    const { lat, lng, distance, name, categoryId, delivery_by_owner } = req.query;

    let query = {
      equipment_status: "Active"  // Always filter only active equipment
    };

    // ✅ Exclude equipment owned by the logged-in user if token is provided
    if (req.user && req.user._id) {
      query.ownerId = { $ne: req.user._id };
    }

    // ✅ Apple App Store Guideline 1.2: Filter out equipment from blocked users
    if (userId) {
      const currentUser = await User.findById(userId).select('blocked_users');
      if (currentUser && currentUser.blocked_users && currentUser.blocked_users.length > 0) {
        query.ownerId = { 
          ...query.ownerId,
          $nin: currentUser.blocked_users // Exclude equipment from blocked users
        };
      }
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

    // ✅ Geospatial filtering logic:
    // - If lat/lng not provided or are 0.0: fetch all equipment (no distance filtering)
    // - If lat/lng provided and not 0.0: apply distance filtering
    //   - Default distance: 50km (if distance param not provided)
    //   - Custom distance: use provided distance value in km
    // - Equipment range consideration:
    //   - If delivery_by_owner = true (owner will deliver): Check both user's distance AND equipment's service range
    //   - If delivery_by_owner = false (user will pickup): Only check user's search distance
    let geoPipeline = [];
    const parsedLat = lat ? parseFloat(lat) : 0.0;
    const parsedLng = lng ? parseFloat(lng) : 0.0;
    
    // Only apply geospatial filtering if valid coordinates are provided
    if (parsedLat !== 0.0 && parsedLng !== 0.0) {
      const maxDistanceKm = distance ? parseFloat(distance) : 50; // Default to 50km

      geoPipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: [parsedLng, parsedLat] },
          distanceField: "distance",
          maxDistance: maxDistanceKm * 1000, // Convert km to meters
          spherical: true,
          key: "location.coordinates", // Use the GeoJSON coordinates field
          query: query // Apply other filters within $geoNear
        },
      });

      // ✅ Add equipment range filtering logic
      // If owner delivers (delivery_by_owner = true), check if user is within equipment's service range
      geoPipeline.push({
        $addFields: {
          distanceInKm: { $divide: ["$distance", 1000] }, // Convert meters to km
          equipmentRangeKm: { $ifNull: ["$location.range", 50] } // Default to 50km if not set
        }
      });

      geoPipeline.push({
        $match: {
          $or: [
            { delivery_by_owner: false }, // User pickup - no range check needed
            { 
              $and: [
                { delivery_by_owner: true }, // Owner delivers
                { $expr: { $lte: ["$distanceInKm", "$equipmentRangeKm"] } } // User within equipment's service range
              ]
            }
          ]
        }
      });
    } else {
      // No geospatial filtering - just apply regular filters
      geoPipeline.push({ $match: query });
    }

    // ✅ Fetch filtered equipment
    let equipments = await Equipment.aggregate(geoPipeline);

    const maxDistanceKm = parsedLat !== 0.0 && parsedLng !== 0.0 ? (distance ? parseFloat(distance) : 50) : 0;

    // ✅ Fallback 1: include equipment that have lat/lng but no location.coordinates (so $geoNear skipped them)
    if (parsedLat !== 0.0 && parsedLng !== 0.0) {
      const fallbackQuery = {
        ...query,
        'location.lat': { $exists: true, $nin: [null, undefined] },
        'location.lng': { $exists: true, $nin: [null, undefined] },
        $or: [
          { 'location.coordinates': { $exists: false } },
          { 'location.coordinates': null },
          { 'location.coordinates.type': { $ne: 'Point' } },
          { 'location.coordinates.coordinates': { $exists: false } },
          { 'location.coordinates.coordinates': { $not: { $size: 2 } } },
        ],
      };
      const fallbackDocs = await Equipment.find(fallbackQuery).lean();
      const geoIds = new Set(equipments.map((e) => e._id.toString()));
      const fallbackWithDistance = fallbackDocs
        .map((doc) => {
          const distKm = haversineDistanceKm(parsedLat, parsedLng, doc.location.lat, doc.location.lng);
          return { ...doc, distance: distKm * 1000, distanceInKm: distKm };
        })
        .filter((doc) => doc.distanceInKm <= maxDistanceKm)
        .filter((doc) => {
          if (!doc.delivery_by_owner) return true;
          const rangeKm = doc.location?.range ?? 50;
          return doc.distanceInKm <= rangeKm;
        })
        .filter((doc) => !geoIds.has(doc._id.toString()));
      equipments = [...equipments, ...fallbackWithDistance].sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    // ✅ Fallback 2: when $geoNear returned 0 (e.g. missing 2dsphere index), use find + haversine so listing still works
    if (equipments.length === 0 && parsedLat !== 0.0 && parsedLng !== 0.0 && maxDistanceKm > 0) {
      const distanceQuery = {
        ...query,
        $or: [
          { 'location.coordinates.type': 'Point', 'location.coordinates.coordinates': { $exists: true, $size: 2 } },
          { 'location.lat': { $exists: true, $nin: [null, undefined] }, 'location.lng': { $exists: true, $nin: [null, undefined] } },
        ],
      };
      const allWithLocation = await Equipment.find(distanceQuery).lean();
      equipments = allWithLocation
        .map((doc) => {
          const lat = doc.location?.lat ?? doc.location?.coordinates?.coordinates?.[1];
          const lng = doc.location?.lng ?? doc.location?.coordinates?.coordinates?.[0];
          if (lat == null || lng == null) return null;
          const distKm = haversineDistanceKm(parsedLat, parsedLng, lat, lng);
          return { ...doc, distance: distKm * 1000, distanceInKm: distKm };
        })
        .filter((doc) => doc != null && doc.distanceInKm <= maxDistanceKm)
        .filter((doc) => {
          if (!doc.delivery_by_owner) return true;
          const rangeKm = doc.location?.range ?? 50;
          return doc.distanceInKm <= rangeKm;
        })
        .sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    // ✅ Fetch subcategories and categories using helper function
    const subCategoryIds = equipments.map(equipment => equipment.subCategoryId.toString());
    const subCategoryMap = await getMultipleSubCategoryDetails(subCategoryIds);

    // ✅ Enhanced equipment response with all details
    const formattedEquipments = await Promise.all(equipments.map(async (equipment) => {
      const subCategoryDetails = subCategoryMap[equipment.subCategoryId.toString()];
      const [resolvedNoticePeriod, resolvedMinTrip, resolvedMaxTrip] = await Promise.all([
        resolveDuration(equipment.notice_period),
        resolveDuration(equipment.minimum_trip_duration),
        resolveDuration(equipment.maximum_trip_duration),
      ]);

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
        images: normalizeImageUrls(equipment.images),
        isFavorite: userId ? (await User.findById(userId))?.favorite_equipments.includes(equipment._id) || false : false,
        location: {
          address: equipment.location?.address || "",
          lat: equipment.location?.lat || 0.0,
          lng: equipment.location?.lng || 0.0,
          range: equipment.location?.range || 0,
        },
        make: equipment.make,
        maximum_trip_duration: resolvedMaxTrip,
        minimum_trip_duration: resolvedMinTrip,
        model: equipment.model,
        name: equipment.name,
        notice_period: resolvedNoticePeriod,
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
        reserved_till: await getReservationText(equipment._id),
      };
      }

      return {
        _id: equipment._id,
        average_rating: await getAverageRating(equipment._id),
        created_at: equipment.createdAt ? equipment.createdAt.toGMTString() : new Date().toGMTString(),
        delivery_by_owner: equipment.delivery_by_owner,
        description: equipment.description,
        equipment_price: equipment.equipment_price,
        images: normalizeImageUrls(equipment.images),
        isFavorite: userId ? (await User.findById(userId))?.favorite_equipments.includes(equipment._id) || false : false,
        location: {
          address: equipment.location?.address || "",
          lat: equipment.location?.lat || 0.0,
          lng: equipment.location?.lng || 0.0,
          range: equipment.location?.range || 0,
        },
        make: equipment.make,
        maximum_trip_duration: resolvedMaxTrip,
        minimum_trip_duration: resolvedMinTrip,
        model: equipment.model,
        name: equipment.name,
        notice_period: resolvedNoticePeriod,
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
        reserved_till: await getReservationText(equipment._id),
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
        const [resolvedNoticePeriod, resolvedMinTrip, resolvedMaxTrip] = await Promise.all([
          resolveDuration(equipment.notice_period),
          resolveDuration(equipment.minimum_trip_duration),
          resolveDuration(equipment.maximum_trip_duration),
        ]);

        return {
          _id: equipment._id,
          average_rating: await getAverageRating(equipment._id),
          created_at: equipment.createdAt ? equipment.createdAt.toGMTString() : new Date().toGMTString(),
          delivery_by_owner: equipment.delivery_by_owner,
          description: equipment.description,
          equipment_price: equipment.equipment_price,
          images: normalizeImageUrls(equipment.images),
          isFavorite: owner.favorite_equipments.includes(equipment._id), // All these are favorites
          location: {
            address: equipment.location?.address || "",
            lat: equipment.location?.lat || 0.0,
            lng: equipment.location?.lng || 0.0,
            range: equipment.location?.range || 0,
          },
          make: equipment.make,
          maximum_trip_duration: resolvedMaxTrip,
          minimum_trip_duration: resolvedMinTrip,
          model: equipment.model,
          name: equipment.name,
          notice_period: resolvedNoticePeriod,
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
          reserved_till: await getReservationText(equipment._id),
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

      // Optional token verification - only set conversationId if valid token is provided
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
          // Don't return error for invalid token, just log it and continue without conversationId
          console.error("Invalid token (continuing without conversation ID):", error);
          conversationId = "";
        }
      }

      const [resolvedNoticePeriod, resolvedMinTrip, resolvedMaxTrip] = await Promise.all([
        resolveDuration(equipment.notice_period),
        resolveDuration(equipment.minimum_trip_duration),
        resolveDuration(equipment.maximum_trip_duration),
      ]);

      // Formatting the equipment details
      const equipmentDetails = {
        _id: equipment._id,
        created_at: equipment.createdAt ? equipment.createdAt.toGMTString() : new Date().toGMTString(),
        delivery_by_owner: equipment.delivery_by_owner || false,
        description: equipment.description || '',
        equipment_price: equipment.equipment_price || 0,
        images: normalizeImageUrls(equipment.images),
        equipment_status: equipment.equipment_status,
        location: {
          address: equipment.location?.address || '',
          lat: equipment.location?.lat || 0.0,
          lng: equipment.location?.lng || 0.0,
          range: equipment.location?.range || 0,
        },
        make: equipment.make || '',
        maximum_trip_duration: resolvedMaxTrip,
        message: 'Equipment details retrieved successfully',
        minimum_trip_duration: resolvedMinTrip,
        model: equipment.model || '',
        name: equipment.name || '',
        notice_period: resolvedNoticePeriod,
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
        reserved_till: await getReservationText(equipment._id),
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

      // Check for active orders (not Finished, Cancelled, or Returned)
      const activeOrderCount = await Order.countDocuments({
        equipmentId: equipmentId,
        rental_status: { $in: ['Booked', 'Delivered', 'Ongoing', 'Late'] }
      });

      if (activeOrderCount > 0) {
        return res.status(400).json({
          message: `Cannot delete equipment. ${activeOrderCount} active order(s) exist. Please wait for orders to complete or cancel them first.`,
          status: false
        });
      }

      // Clean up: Remove this equipment from all users' favorites
      await User.updateMany(
        { favorite_equipments: equipmentId },
        { $pull: { favorite_equipments: equipmentId } }
      );
  
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
      // Fetch all active equipment that have images, with owner details
      const equipments = await Equipment.find({ 
        equipment_status: "Active",
        images: { $exists: true, $ne: [], $type: 'array' }
      }).populate({
        path: 'ownerId',
        model: User,
        select: '_id name email profile_image'
      });
      
      console.log(`📸 Random images: Found ${equipments?.length || 0} active equipment with images`);
  
      if (!equipments || equipments.length === 0) {
        return res.status(200).json({
          images: [],
          message: 'No equipment found',
          status: false,
        });
      }
  
      // Helper: Create image object from equipment (picks random image from equipment)
      const createImageObject = (equipment) => ({
        equipmentId: equipment._id,
        image: equipment.images[Math.floor(Math.random() * equipment.images.length)],
        owner: equipment.ownerId
          ? {
              _id: equipment.ownerId._id,
              name: equipment.ownerId.name,
              email: equipment.ownerId.email,
              profile_image: equipment.ownerId.profile_image,
            }
          : null,
      });
  
      const result = [];
      const TARGET_COUNT = 20;
      const equipmentCount = equipments.length;
  
      if (equipmentCount >= TARGET_COUNT) {
        // CASE 1: More than 20 equipment → Pick 20 random unique equipment (NO duplicates)
        const shuffled = [...equipments].sort(() => Math.random() - 0.5);
        for (let i = 0; i < TARGET_COUNT; i++) {
          result.push(createImageObject(shuffled[i]));
        }
      } else {
        // CASE 2: Less than 20 equipment → Use all, fill with duplicates
        // Strategy: Interleave equipment in round-robin to maximize distance between duplicates
        // Example: 3 equipment for 20 slots → A,B,C,A,B,C,A,B,C,A,B,C,A,B,C,A,B,C,A,B
        
        // Shuffle the equipment for randomness
        const shuffled = [...equipments].sort(() => Math.random() - 0.5);
        
        // Fill 20 slots using round-robin (interleaved pattern)
        // This ensures: 1) Minimum duplication (each used same times ±1)
        //               2) Maximum distance between same equipment
        for (let i = 0; i < TARGET_COUNT; i++) {
          const equipment = shuffled[i % equipmentCount];
          result.push(createImageObject(equipment));
        }
      }
  
      console.log(`📸 Random images: returning ${result.length} images (${equipments.length} unique equipment)`);
      
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
    const formattedEquipments = await Promise.all(equipments.map(async equipment => {
      const subCategoryDetails = subCategoryMap[equipment.subCategoryId.toString()];
      return {
        _id: equipment._id,
        name: equipment.name,
        make: equipment.make,
        rental_price: equipment.rental_price,
        images: normalizeImageUrls(equipment.images),
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
        conversationId,
        reserved_till: await getReservationText(equipment._id),
      };
    }));

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
    const formattedFavoriteEquipments = await Promise.all(favoriteEquipments.map(async equipment => {
      const subCategoryDetails = subCategoryMap[equipment.subCategoryId.toString()];
      return {
        _id: equipment._id,
        name: equipment.name,
        make: equipment.make,
        rental_price: equipment.rental_price,
        images: normalizeImageUrls(equipment.images),
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
        reserved_till: await getReservationText(equipment._id),
      };
    }));

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

/**
 * Owner self-service: update equipment status between Active and InActive only.
 * Used by the app when owner deactivates/activates their listing.
 */
async function updateMyEquipmentStatus(req, res) {
  try {
    const userId = req.userId;
    const { equipmentId, status } = req.query;
    if (!equipmentId || !status) {
      return res.status(400).json({ message: "Equipment ID and status are required." });
    }
    const allowedStatuses = ['Active', 'InActive'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Status must be Active or InActive." });
    }
    const equipment = await Equipment.findById(equipmentId);
    if (!equipment) return res.status(404).json({ message: "Equipment not found." });
    if (String(equipment.ownerId) !== userId) {
      return res.status(403).json({ message: "You can only update your own equipment." });
    }
    const current = equipment.equipment_status;
    if (current !== 'Active' && current !== 'InActive') {
      return res.status(400).json({
        message: `Cannot change status from ${current}. Only Active equipment can be deactivated, and only InActive can be activated.`,
      });
    }
    equipment.equipment_status = status;
    await equipment.save({ validateModifiedOnly: true });
    return res.status(200).json({
      message: `Equipment is now ${status}.`,
      status: true,
      equipment_status: equipment.equipment_status,
    });
  } catch (error) {
    console.error('Error in updateMyEquipmentStatus:', error);
    return res.status(500).json({ message: "Error updating equipment status.", error: error.message });
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

    // Send admin notification for equipment resubmission (when rejected equipment becomes active/pending)
    if (oldStatus === 'Rejected' && (status === 'Active' || status === 'Pending')) {
      const owner = await User.findById(equipment.ownerId).select('name email');
      const subCategory = await findSubCategoryById(equipment.subCategoryId);
      
      await createAdminNotification(
        'equipment_resubmission',
        `Equipment "${equipment.name}" resubmitted by ${owner.name} after rejection`,
        {
          userId: equipment.ownerId,
          equipmentId: equipment._id,
          data: {
            equipmentName: equipment.name,
            ownerName: owner.name,
            ownerEmail: owner.email,
            category: subCategory ? subCategory.categoryName : 'Unknown',
            subcategory: subCategory ? subCategory.name : 'Unknown',
            previousStatus: oldStatus,
            newStatus: status,
            resubmissionDate: new Date()
          }
        }
      );
    }

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

    // Get equipment with owner details (subcategories are embedded in Category, so resolve names via helper)
    console.log("🔹 Fetching equipment with query:", query);
    const equipments = await Equipment.find(query)
      .populate('ownerId', 'name email profile_image')
      .lean();
    console.log(`🔹 Found ${equipments.length} equipment`);

    const subCategoryIds = equipments.map((e) => e.subCategoryId?.toString()).filter(Boolean);
    const subCategoryMap = await getMultipleSubCategoryDetails(subCategoryIds);

    // Get rental counts for each equipment
    console.log("🔹 Getting rental stats for each equipment");
    const equipmentsWithStats = await Promise.all(equipments.map(async (equipment) => {
      const subCategoryDetails = equipment.subCategoryId
        ? subCategoryMap[equipment.subCategoryId.toString()]
        : null;

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
        images: normalizeImageUrls(equipment.images),
        category: subCategoryDetails?.category_name ?? 'Unknown',
        sub_category: subCategoryDetails?.sub_category_name ?? 'Unknown',
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
        reserved_till: await getReservationText(equipment._id),
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
    // Find all equipment matching text fields or exact id/owner_id (subcategories resolved via helper)
    let equipments = await Equipment.find({ $or: orQuery })
      .populate('ownerId', 'name email profile_image')
      .lean();
    // If not an exact ObjectId, also filter for partial _id and owner_id match
    if (!mongoose.Types.ObjectId.isValid(text)) {
      const textLower = text.toLowerCase();
      const allEquipments = await Equipment.find()
        .populate('ownerId', 'name email profile_image')
        .lean();
      const filtered = allEquipments.filter(e =>
        e._id.toString().toLowerCase().includes(textLower) ||
        (e.ownerId && e.ownerId._id && e.ownerId._id.toString().toLowerCase().includes(textLower))
      );
      const ids = new Set(equipments.map(e => e._id.toString()));
      filtered.forEach(e => {
        if (!ids.has(e._id.toString())) equipments.push(e);
      });
    }
    const subCategoryIds = equipments.map((e) => e.subCategoryId?.toString()).filter(Boolean);
    const subCategoryMap = await getMultipleSubCategoryDetails(subCategoryIds);

    // Format the response
    const formattedEquipments = await Promise.all(equipments.map(async equipment => {
      const subCategoryDetails = equipment.subCategoryId
        ? subCategoryMap[equipment.subCategoryId.toString()]
        : null;
      return {
      _id: equipment._id,
      name: equipment.name,
      make: equipment.make,
      model: equipment.model,
      serial_number: equipment.serial_number,
      description: equipment.description,
      images: normalizeImageUrls(equipment.images),
      category: subCategoryDetails?.category_name ?? 'Unknown',
      sub_category: subCategoryDetails?.sub_category_name ?? 'Unknown',
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
      reserved_till: await getReservationText(equipment._id),
      created_at: equipment.createdAt
    };
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
  updateMyEquipmentStatus,
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
