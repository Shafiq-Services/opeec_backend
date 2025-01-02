const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const orderController = require('../controllers/orders');
const { userMiddleware } = require("../middleWares/user");

router.use(userMiddleware);
router.get('/orders', orderController.getOrdersByStatus);

//seller
router.put('/deliver', orderController.deliverOrder);
router.put('/finish', orderController.finishOrder);
router.put('/cancel', orderController.cancelOrder);
//customer
router.post('/add', orderController.addOrder);
router.put('/return', orderController.returnOrder);
module.exports = router;