const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categories');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Apply admin middleware to all routes
router.use(adminMiddleware);
// Category Management Routes
router.get('/all', categoriesController.getAllCategories);
router.post('/add', categoriesController.addCategory);
router.put('/update', categoriesController.updateCategory);
router.delete('/delete', categoriesController.deleteCategory);

module.exports = router;