const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const orderController = require('../controllers/orders');
const { userMiddleware } = require("../middleWares/user");

router.use(userMiddleware);

router.post('/add', orderController.addOrder);

module.exports = router;