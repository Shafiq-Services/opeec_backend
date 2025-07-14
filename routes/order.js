const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orders');
const { userMiddleware } = require("../middleWares/user");

// Apply user middleware to all routes
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