const Category = require('../models/categories'); // Category model with embedded subcategories

async function addCategory(req, res) {
    try {
      const { category_name, categoryImage, sub_categories } = req.body;
  
      // Validation for required fields
      if (!category_name || !categoryImage || !sub_categories || sub_categories.length === 0) {
        return res.status(400).json({
          message: 'All required fields must be provided: category_name, categoryImage, sub_categories.',
          status: false,
        });
      }

      // Validate that each subcategory has required fields including security_fee
      for (const subCat of sub_categories) {
        if (!subCat.name || subCat.security_fee === undefined || subCat.security_fee === null) {
          return res.status(400).json({
            message: 'Each subcategory must have name and security_fee.',
            status: false,
          });
        }
      }
  
      // Create new Category with embedded subcategories
      const newCategory = new Category({
        name: category_name,
        category_image: categoryImage,
        sub_categories: sub_categories // Directly embed subcategories
      });
  
      // Save the new category to the database
      const savedCategory = await newCategory.save();
      console.log('New Category with embedded subcategories saved:', savedCategory);
  
      // Prepare the response with saved data
      const response = {
        message: 'Category and Subcategories added successfully',
        status: true,
        category: {
          category_id: savedCategory._id,
          name: savedCategory.name,
          category_image: savedCategory.category_image,
          sub_categories: savedCategory.sub_categories.map(sub => ({
            sub_category_id: sub._id,
            name: sub.name,
            security_fee: sub.security_fee,
          })),
        },
      };
  
      return res.status(201).json(response);
    } catch (err) {
      console.error('Error adding category:', err);
      return res.status(500).json({
        message: 'Server error',
        status: false,
      });
    }
  }

  async function updateCategory(req, res) {
    try {
      const { category_id, categoryId } = req.query;
      const categoryIdToUse = category_id || categoryId; // Support both parameter names
      const { name, category_image, sub_categories } = req.body;
  
      // Find the category by ID
      const category = await Category.findById(categoryIdToUse);
  
      if (!category) {
        return res.status(404).json({
          message: 'Category not found',
          status: false,
        });
      }
  
      // Update category details
      category.name = name || category.name;
      category.category_image = category_image || category.category_image;

      // If sub_categories are provided, update them
      if (sub_categories && sub_categories.length > 0) {
        // Validate that each subcategory has required fields including security_fee
        for (const subCat of sub_categories) {
          if (!subCat.name || subCat.security_fee === undefined || subCat.security_fee === null) {
            return res.status(400).json({
              message: 'Each subcategory must have name and security_fee.',
              status: false,
            });
          }
        }

        // Update embedded subcategories
        category.sub_categories = sub_categories;
      }
  
      // Save updated category
      await category.save();
      console.log('Category updated:', category);
  
      // Prepare the response
      const response = {
        message: 'Category and Subcategories updated successfully',
        status: true,
        category: {
          category_id: category._id,
          name: category.name,
          category_image: category.category_image,
          sub_categories: category.sub_categories.map(sub => ({
            sub_category_id: sub._id,
            name: sub.name,
            security_fee: sub.security_fee,
          })),
        },
      };

      return res.status(200).json(response);
  
    } catch (err) {
      console.error('Error updating category:', err);
      return res.status(500).json({
        message: 'Server error',
        status: false,
      });
    }
  }


  async function deleteCategory(req, res) {
    try {
      const { category_id, categoryId } = req.query;
      const categoryIdToUse = category_id || categoryId; // Support both parameter names
  
      // Find and delete the category by ID (subcategories are automatically deleted since they're embedded)
      const deletedCategory = await Category.findByIdAndDelete(categoryIdToUse);
  
      if (!deletedCategory) {
        return res.status(404).json({
          message: 'Category not found',
          status: false,
        });
      }
  
      // Return success response
      return res.status(200).json({
        message: 'Category and its subcategories deleted successfully',
        status: true,
      });
    } catch (err) {
      console.error('Error deleting category:', err);
      return res.status(500).json({
        message: 'Server error',
        status: false,
      });
    }
  }


async function getAllCategories(req, res) {
  try {
    const categories = await Category.find().lean();

    if (!categories || categories.length === 0) {
      return res.status(200).json({
        message: 'No categories found',
        status: false,
      });
    }

    // Format the categories with embedded subcategories
    const formattedCategories = categories.map(category => ({
      category_id: category._id,
      category_image: category.category_image,
      name: category.name,
      sub_categories: category.sub_categories?.map(subCategory => ({
        sub_category_id: subCategory._id,
        name: subCategory.name,
        security_fee: subCategory.security_fee,
      })) || []
    }));

    // Prepare the response
    const response = {
        message: 'Categories Found',
        status: true,
        categories: formattedCategories
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error('Error fetching categories:', err);
    return res.status(500).json({
      message: 'Server error',
      status: false,
    });
  }
}

module.exports = { addCategory, getAllCategories, updateCategory, deleteCategory };
