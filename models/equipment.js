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

// Equipment Schema - Simplified duration fields (plain numbers = days)
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
  
  // Duration fields - stored as plain numbers (days)
  // API output transforms these to { selectedValue: N } for Flutter compatibility
  notice_period: { type: mongoose.Schema.Types.Mixed, default: 0 },
  minimum_trip_duration: { type: mongoose.Schema.Types.Mixed, default: 1 },
  maximum_trip_duration: { type: mongoose.Schema.Types.Mixed, default: 0 },
  
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

// Pre-save: set GeoJSON coordinates from lat/lng so get_listing $geoNear and 2dsphere index work for new/updated equipment
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

// Helper: extract days value from duration field (handles both old nested and new plain number formats)
function extractDays(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object') {
    return value.selectedValue ?? value.count ?? 0;
  }
  return 0;
}

// toJSON transform: output duration fields as { selectedValue: N } for Flutter compatibility
equipmentSchema.set('toJSON', {
  transform: function(doc, ret) {
    // Transform duration fields to Flutter-compatible format
    ret.notice_period = { selectedValue: extractDays(ret.notice_period) };
    ret.minimum_trip_duration = { selectedValue: extractDays(ret.minimum_trip_duration) };
    ret.maximum_trip_duration = { selectedValue: extractDays(ret.maximum_trip_duration) };
    return ret;
  }
});

// toObject transform: same as toJSON for consistency
equipmentSchema.set('toObject', {
  transform: function(doc, ret) {
    ret.notice_period = { selectedValue: extractDays(ret.notice_period) };
    ret.minimum_trip_duration = { selectedValue: extractDays(ret.minimum_trip_duration) };
    ret.maximum_trip_duration = { selectedValue: extractDays(ret.maximum_trip_duration) };
    return ret;
  }
});

module.exports = mongoose.model('Equipment', equipmentSchema);
