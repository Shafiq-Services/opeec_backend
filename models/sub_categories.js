const mongoose = require('mongoose');

// SubCategory Schema
const subCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true }
}, { 
  timestamps: true, // Adding timestamps for consistency
  collection: 'sub_categories' // Explicitly specify collection name to match existing data
});

module.exports = mongoose.model('SubCategory', subCategorySchema);
