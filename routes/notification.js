const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification');
const { userMiddleware } = require("../middleWares/user");

router.use(userMiddleware);
router.post('/send', notificationController.sendNotification);
router.get('/get-notifications', notificationController.getNotifications);

module.exports = router;
