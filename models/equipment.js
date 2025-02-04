const mongoose = require('mongoose');

// Equipment Schema
const equipmentSchema = new mongoose.Schema({
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  make: { type: String, required: true, trim: true },
  model: { type: String, required: true, trim: true },
  serial_number: { type: String, required: true, unique: true },
  description: { type: String, default: "" },
  images: [{ type: String }],
  sub_category_fk: { type: mongoose.Schema.Types.ObjectId, ref: 'sub_categories', required: true },
  postal_code: { type: String, default: "" },
  delivery_by_owner: { type: Boolean, default: false },
  rental_price: { type: Number, required: true },
  equipment_price: { type: Number, required: true },
  notice_period: {
    type: { type: String, required: true, enum: ['hour', 'day', 'month'] },
    count: { type: Number, required: true }
  },
  minimum_trip_duration: {
    type: { type: String, required: true, enum: ['hour', 'day', 'month'] },
    count: { type: Number, required: true }
  },
  maximum_trip_duration: {
    type: { type: String, required: true, enum: ['hour', 'day', 'month'] },
    count: { type: Number, required: true }
  },
  equipment_status: { 
    type: String, 
    enum: ['Pending', 'Rejected', 'InActive', 'Active', 'Blocked'],
    default: 'Pending' 
  },
  reason: { type: String, default: "" },
  custom_location: {
    address: { type: String, required: true },
    lat: { type: Number, required: true },
    long: { type: Number, required: true },
    range: { type: Number, required: true },
  },
});

// Adding 2dsphere index for geospatial queries
equipmentSchema.index({ location: "2dsphere" });

module.exports = mongoose.model('Equipments', equipmentSchema);
