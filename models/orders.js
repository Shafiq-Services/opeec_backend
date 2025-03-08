const mongoose = require('mongoose');

// Order Schema
const orderSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // User placing the order
  equipment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipments', required: true }, // Equipment being rented
  rental_schedule: {
    start_date: { type: Date, required: true }, // Rental start date
    end_date: { type: Date, required: true } // Rental end date
  },
  location: {
    address: { type: String, required: true }, // Address of the equipment's location
    lat: { type: Number, required: true }, // Latitude of the equipment's location
    long: { type: Number, required: true } // Longitude of the equipment's location
  },
  total_amount: { type: Number, required: true }, // Total rental cost
  security_fee: {
    cost: { type: Number, default: 0 },
    insurance: { type: Boolean, default: false }
  },
  cancellation: {
    is_cancelled: { type: Boolean, default: false }, // Cancellation flag
    reason: { type: String }, // Reason for cancellation (if applicable)
    cancelled_at: { type: Date } // Cancellation timestamp
  },
  rental_status: { 
    type: String, 
    enum: ['Booked', 'Delivered', 'Ongoing', 'Returned', 'Cancelled', 'Finished', 'Late'],
    default: 'Booked' 
  },
  return_status: {
    is_returned: { type: Boolean, default: false }, // Return flag
    returned_at: { type: Date } // Return timestamp
  },
  owner_images: [{ type: String }], // Images of the equipment returned by the user
  buyer_images: [{ type: String }], // Images of the equipment returned by the owner
  created_at: { type: Date, default: Date.now }, // Order creation timestamp
  updated_at: { type: Date, default: Date.now }, // Last updated timestamp
  penalty_apply: { type: Boolean, default: true }, // New field - default to false
  penalty_amount: { type: Number, default: 0 }, // New field - default to 0
  status_change_timestamp: { type: Date, default: Date.now }, // New field - default to current timestamp
});

module.exports = mongoose.model('Orders', orderSchema);
