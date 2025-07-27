const mongoose = require('mongoose');

// Category Schema
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category_image: { type: String, default: "" },
  security_fee: { type: Number, required: true }
}, { 
  timestamps: true // Adding timestamps for consistency
});

module.exports = mongoose.model('Category', categorySchema);
