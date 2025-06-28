const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const orderController = require('../controllers/orders');
const { userMiddleware } = require("../middleWares/user");
const { adminMiddleware } = require("../middleWares/adminMiddleWare");

// ---------------------- Admin Routes ----------------------

// Get rentals by status (admin only)
router.get('/admin/get_by_status', adminMiddleware, orderController.getRentalsByStatus);

// ---------------------- Protected User Routes ----------------------

// Apply user middleware to user routes
router.use(userMiddleware);

router.get('/current-rentals', orderController.getCurrentRentals);
router.get('/history-rentals', orderController.getHistoryRentals);
//seller
router.put('/cancel', orderController.cancelOrder);
router.put('/deliver', orderController.deliverOrder);
router.put('/finish', orderController.finishOrder);
//customer
router.post('/add', orderController.addOrder);
router.put('/collect', orderController.collectOrder);
router.put('/return', orderController.returnOrder);
router.put('/change-penalty', orderController.togglePenalty);
router.post('/add-review', orderController.addBuyerReview);

module.exports = router;