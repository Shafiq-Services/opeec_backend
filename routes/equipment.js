const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipment');
const { userMiddleware } = require("../middleWares/user");
const equipmentDropdownController = require('../controllers/equipmentDropDown');

// Public route (no auth needed)
router.get('/random-images', equipmentController.getRandomEquipmentImages);
router.get('/get_listing', equipmentController.getAllEquipments);
// Apply user middleware to all routes
router.use(userMiddleware);

// Add equipment
router.post('/add', equipmentController.addEquipment);

// Update equipment
router.put('/update/:id', equipmentController.updateEquipment);

// Delete equipment
router.delete('/delete/:id', equipmentController.deleteEquipment);

// Get user's shop
router.get('/my_shop', equipmentController.getUserShop);

// Get favorite equipment
router.get('/favorites', equipmentController.getFavoriteEquipments);

// Toggle favorite equipment
router.put('/toggle_favorite/:id', equipmentController.toggleFavorite);

// Get my equipment
router.get('/my_equipment', equipmentController.getMyEquipments);

// Get equipment dropdowns
router.get('/equipment-dropdowns', equipmentDropdownController.getEquipmentDropdowns);

router.get('/get', equipmentController.getEquipmentDetails);

module.exports = router;