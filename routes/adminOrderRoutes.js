const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orders');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Apply admin middleware to all routes
router.use(adminMiddleware);

// Order Management Routes
router.get('/by-status', orderController.getRentalsByStatus);

module.exports = router; 