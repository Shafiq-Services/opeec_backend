const mongoose = require('mongoose');

// Equipment Schema
const equipmentSchema = new mongoose.Schema({
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Foreign Key to User model
  name: { type: String, required: true, trim: true }, // Name of the equipment
  make: { type: String, required: true, trim: true }, // Make of the equipment
  model: { type: String, required: true, trim: true }, // Model of the equipment
  serial_number: { type: String, required: true, unique: true }, // Serial number of the equipment
  description: { type: String, default: "" }, // Description of the equipment
  images: [{ type: String }], // List of image URLs for the equipment
  sub_category_fk: { type: mongoose.Schema.Types.ObjectId, ref: 'sub_categories', required: true }, // Foreign Key to SubCategory model
  postal_code: { type: String, default: "" }, // Postal code for the equipment's location
  delivery_by_owner: { type: Boolean, default: false }, // Boolean flag for delivery by the owner
  rental_price: { type: Number, required: true }, // Rental price of the equipment
  equipment_price: { type: Number, required: true }, // Price of the equipment
  notice_period: {
    type: { type: String, required: true, enum: ['hour', 'day', 'month'] }, // Type of notice period (hour, day, month)
    count: { type: Number, required: true } // Duration of notice period
  },
  minimum_trip_duration: {
    type: { type: String, required: true, enum: ['hour', 'day', 'month'] }, // Type of minimum trip duration
    count: { type: Number, required: true } // Duration of minimum trip duration
  },
  maximum_trip_duration: {
    type: { type: String, required: true, enum: ['hour', 'day', 'month'] }, // Type of maximum trip duration
    count: { type: Number, required: true } // Duration of maximum trip duration
  },
  isLive: { type: Boolean, default: false }, // Boolean flag for equipment's live status
  location: {
    address: { type: String, required: true }, // Address of the equipment's location
    lat: { type: Number, required: true }, // Latitude of the equipment's location
    long: { type: Number, required: true } // Longitude of the equipment's location
  }
});

module.exports = mongoose.model('Equipments', equipmentSchema);
