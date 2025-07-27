const Category = require('../models/categories'); // Category model
const SubCategory = require('../models/sub_categories'); // SubCategory model

async function addCategory(req, res) {
    try {
      const { category_name, security_fee, categoryImage, sub_categories } = req.body;
  
      // Validation for required fields
      if (!category_name || !security_fee || !categoryImage || !sub_categories || sub_categories.length === 0) {
        return res.status(400).json({
          message: 'All required fields must be provided.',
          status: false,
        });
      }
  
      // Create new Category
      const newCategory = new Category({
        name: category_name,
        category_image: categoryImage,
        security_fee: security_fee,
      });
  
      // Save the new category to the database
      const savedCategory = await newCategory.save();
      console.log('New Category saved:', savedCategory);
  
      // Prepare and save subcategories
      const subCategoryPromises = sub_categories.map(async (subCategoryData) => {
        const newSubCategory = new SubCategory({
          name: subCategoryData.name,
          categoryId: savedCategory._id, // Associate subcategory with the saved category
        });
  
        // Save subcategory
        const savedSubCategory = await newSubCategory.save();
        console.log('New SubCategory saved:', savedSubCategory);
        return savedSubCategory;
      });
  
      // Wait for all subcategories to be saved
      const savedSubCategories = await Promise.all(subCategoryPromises);
  
      // Prepare the response with saved data
      const response = {
        message: 'Category and Subcategories added successfully',
        status: true,
        category: {
          category_id: savedCategory._id,
          name: savedCategory.name,
          category_image: savedCategory.category_image,
          security_fee: savedCategory.security_fee,
          sub_categories: savedSubCategories.map(sub => ({
            sub_category_id: sub._id,
            name: sub.name,
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
      const { category_id } = req.query;
      const { name, security_fee, category_image, sub_categories } = req.body;
  
      // Find the category by ID
      const category = await Category.findById(category_id);
  
      if (!category) {
        return res.status(404).json({
          message: 'Category not found',
          status: false,
        });
      }
  
      // Update category details
      category.name = name || category.name;
      category.security_fee = security_fee || category.security_fee;
      category.category_image = category_image || category.category_image;
  
      // Save updated category
      await category.save();
      console.log('Category updated:', category);
  
      // If sub_categories are provided, update them
      if (sub_categories && sub_categories.length > 0) {
        // Delete old subcategories and add new ones
        await SubCategory.deleteMany({ categoryId: category._id });
  
        const subCategoryPromises = sub_categories.map(async (subCategoryData) => {
          const newSubCategory = new SubCategory({
            name: subCategoryData.name,
            categoryId: category._id, // Associate subcategory with the category
          });
  
          // Save new subcategory
          await newSubCategory.save();
          return newSubCategory;
        });
  
        const savedSubCategories = await Promise.all(subCategoryPromises);
        console.log('SubCategories updated:', savedSubCategories);
  
        // Prepare the response
        const response = {
          message: 'Category and Subcategories updated successfully',
          status: true,
          category: {
            category_id: category._id,
            name: category.name,
            category_image: category.category_image,
            security_fee: category.security_fee,
            sub_categories: savedSubCategories.map(sub => ({
              sub_category_id: sub._id,
              name: sub.name,
            })),
          },
        };
  
        return res.status(200).json(response);
      }
  
      // If no subcategories are provided, return only the updated category
      const response = {
        message: 'Category updated successfully',
        status: true,
        category: {
          category_id: category._id,
          name: category.name,
          category_image: category.category_image,
          security_fee: category.security_fee,
          sub_categories: [],
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
      const { category_id } = req.query;
  
      // Find the category by ID
      const category = await Category.findById(category_id);
  
      if (!category) {
        return res.status(404).json({
          message: 'Category not found',
          status: false,
        });
      }
  
      // Delete all subcategories associated with this category
      await SubCategory.deleteMany({ categoryId: category._id });
  
      // Delete the category
      await Category.findByIdAndDelete(category_id);
  
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

    // Loop through each category and populate subcategories
    const formattedCategories = await Promise.all(categories.map(async (category) => {
      // Fetch the subcategories for each category
      const subCategories = await SubCategory.find({ categoryId: category._id }).lean();
      // Format the category data
      const formattedCategory = {
        category_id: category._id,
        category_image: category.category_image,
        name: category.name,
        security_fee: category.security_fee,
        sub_categories: subCategories.map(subCategory => ({
          sub_category_id: subCategory._id,
          name: subCategory.name,
        }))
      };

      return formattedCategory;
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
