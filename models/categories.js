const mongoose = require('mongoose');

// Category Schema
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // Name of the category
  category_image: { type: String, default: "" }, // Image URL for the category
  security_fee: { type: Number, required: true }, // Security fee for the category
});

module.exports = mongoose.model('categories', categorySchema);
