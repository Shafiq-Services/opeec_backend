const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const equipmentController = require('../controllers/equipment');
const { userMiddleware } = require("../middleWares/user");

router.use(userMiddleware);

router.post('/add', equipmentController.addEquipment);
router.put('/update', equipmentController.updateEquipment);
router.get('/get_all', equipmentController.getAllEquipments);
router.get('/get', equipmentController.getEquipmentDetails);
router.delete('/delete', equipmentController.deleteEquipment);
router.get('/get_listing', equipmentController.getRandomEquipmentImages);
router.get('/get_user_shop', equipmentController.getUserShop);
router.post('/favorite', equipmentController.toggleFavorite);
router.get('/favorites', equipmentController.getFavoriteEquipments);
router.put("/update_status", equipmentController.updateEquipmentStatus);

module.exports = router;