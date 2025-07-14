const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipment');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Apply admin middleware to all routes
router.use(adminMiddleware);

// Equipment Management Routes
router.get('/all', equipmentController.getAllEquipments);
router.get('/details/:id', equipmentController.getEquipmentDetails);
router.get('/by-status', equipmentController.getEquipmentByStatus);
router.get('/search', equipmentController.searchEquipment);
router.put('/update-status', equipmentController.updateEquipmentStatus);

module.exports = router; 