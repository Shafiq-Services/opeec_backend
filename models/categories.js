const mongoose = require('mongoose');

// SubCategory embedded schema (no separate collection)
const subCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  security_fee: { type: Number, required: true, default: 0 }
}, { _id: true }); // Keep _id for subcategories for easier referencing

// Category Schema with embedded subcategories
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category_image: { type: String, default: "" },
  sub_categories: [subCategorySchema] // Embedded subcategories
}, { 
  timestamps: true // Adding timestamps for consistency
});

module.exports = mongoose.model('Category', categorySchema);
