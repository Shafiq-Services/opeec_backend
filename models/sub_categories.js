const mongoose = require('mongoose');

// SubCategory Schema
const subCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // Name of the subcategory
  category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'categories', required: true }, // Foreign Key to Category model
});

module.exports = mongoose.model('sub_categories', subCategorySchema);
