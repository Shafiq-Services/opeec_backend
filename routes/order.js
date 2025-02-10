const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const orderController = require('../controllers/orders');
const { userMiddleware } = require("../middleWares/user");

router.use(userMiddleware);
router.get('/current-rentals', orderController.getCurrentRentals);
router.get('/history-rentals', orderController.getHistoryRentals);
//seller
router.put('/cancel', orderController.cancelOrder);
router.put('/deliver', orderController.deliverOrder);
router.put('/finish', orderController.finishOrder);
//customer
router.post('/add', orderController.addOrder);
router.post('/collect', orderController.collectOrder);
router.put('/return', orderController.returnOrder);
module.exports = router;