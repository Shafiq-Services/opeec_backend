const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Apply admin middleware to all routes
router.use(adminMiddleware);

// Dashboard Routes
router.get('/summary', dashboardController.summary);

module.exports = router; 