const mongoose = require('mongoose');

// Flexible Location Schema - handles migrated data
const locationSchema = new mongoose.Schema({
  address: { type: String },
  lat: { type: Number },
  lng: { type: Number },
  range: { type: Number }
}, { _id: false, strict: false });

// Flexible Duration Schema - handles both old and new format
const durationRefSchema = new mongoose.Schema({
  // New format
  dropdownId: { type: mongoose.Schema.Types.ObjectId, ref: 'EquipmentDropdown' },
  selectedValue: { type: Number },
  // Old format (for backward compatibility)
  type: { type: String },
  count: { type: Number }
}, { _id: false, strict: false });

// Equipment Schema - Flexible for migration compatibility
const equipmentSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, trim: true },
  make: { type: String, trim: true },
  model: { type: String, trim: true },
  serial_number: { type: String },
  description: { type: String, default: "" },
  images: [{ type: String }],
  subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubCategory' },
  postal_code: { type: String, default: "" },
  delivery_by_owner: { type: Boolean, default: false },
  rental_price: { type: Number },
  equipment_price: { type: Number },
  
  // Flexible duration fields
  notice_period: durationRefSchema,
  minimum_trip_duration: durationRefSchema,
  maximum_trip_duration: durationRefSchema,
  
  equipment_status: { 
    type: String, 
    enum: ['Pending', 'Rejected', 'InActive', 'Active', 'Blocked'],
    default: 'Pending' 
  },
  reason: { type: String, default: "" },
  location: locationSchema
}, { 
  timestamps: true,
  strict: false, // Allow extra fields during migration
  collection: 'equipments' // Explicitly specify collection name
});

// Adding compound index for location queries
equipmentSchema.index({ "location.lat": 1, "location.lng": 1 });

module.exports = mongoose.model('Equipment', equipmentSchema);
