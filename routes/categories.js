const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categories');

// Public route for getting all categories
router.get('/get_all', categoriesController.getAllCategories);

module.exports = router;