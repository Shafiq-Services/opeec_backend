const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipment');
const { userMiddleware } = require("../middleWares/user");
const { adminMiddleware } = require("../middleWares/adminMiddleWare");
const equipmentDropdownController = require('../controllers/equipmentDropDown');

// Create separate routers for admin and user routes
const adminRouter = express.Router();
const userRouter = express.Router();

// ---------------------- Public Routes ----------------------

// Get all equipment
router.get('/get_all', equipmentController.getAllEquipments);

// Get equipment details
router.get('/details/:id', equipmentController.getEquipmentDetails);

// Get random equipment images
router.get('/random_images', equipmentController.getRandomEquipmentImages);

// ---------------------- Protected User Routes ----------------------

// Apply user middleware to user routes
userRouter.use(userMiddleware);

// Add equipment
userRouter.post('/add', equipmentController.addEquipment);

// Update equipment
userRouter.put('/update/:id', equipmentController.updateEquipment);

// Delete equipment
userRouter.delete('/delete/:id', equipmentController.deleteEquipment);

// Get user's shop
userRouter.get('/my_shop', equipmentController.getUserShop);

// Get favorite equipment
userRouter.get('/favorites', equipmentController.getFavoriteEquipments);

// Toggle favorite equipment
userRouter.put('/toggle_favorite/:id', equipmentController.toggleFavorite);

// Get my equipment
userRouter.get('/my_equipment', equipmentController.getMyEquipments);

// Update equipment status
userRouter.put('/update_status', equipmentController.updateEquipmentStatus);

// ---------------------- Admin Routes ----------------------

// Apply admin middleware to admin routes
adminRouter.use(adminMiddleware);

// Get equipment by status
adminRouter.get('/get_all_equipments', equipmentController.getEquipmentByStatus);

// Get equipment by status
adminRouter.get('/get_by_status', equipmentController.getEquipmentByStatus);

// Search equipment
adminRouter.get('/search', equipmentController.searchEquipment);

// Mount the routers
router.use('/', adminRouter);
router.use('/', userRouter);

module.exports = router;