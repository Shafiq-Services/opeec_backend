const mongoose = require('mongoose');

// Flexible Location Schema - handles migrated data and GeoJSON
const locationSchema = new mongoose.Schema({
  address: { type: String },
  lat: { type: Number },
  lng: { type: Number },
  range: { type: Number },
  // GeoJSON Point for geospatial queries
  coordinates: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  }
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
  subCategoryId: { type: mongoose.Schema.Types.ObjectId, required: true },
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

// Adding compound index for location queries (backward compatibility)
equipmentSchema.index({ "location.lat": 1, "location.lng": 1 });

// Adding 2dsphere index for GeoJSON coordinates (required for $geoNear)
equipmentSchema.index({ "location.coordinates": "2dsphere" });

// Pre-save middleware to populate GeoJSON coordinates from lat/lng
equipmentSchema.pre('save', function(next) {
  if (this.location && this.location.lat != null && this.location.lng != null) {
    this.location.coordinates = {
      type: 'Point',
      coordinates: [this.location.lng, this.location.lat] // [longitude, latitude]
    };
  }
  next();
});

// Pre-update middleware for findOneAndUpdate operations
equipmentSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  const update = this.getUpdate();
  if (update.location && update.location.lat != null && update.location.lng != null) {
    update.location.coordinates = {
      type: 'Point',
      coordinates: [update.location.lng, update.location.lat] // [longitude, latitude]
    };
  }
  next();
});

module.exports = mongoose.model('Equipment', equipmentSchema);
