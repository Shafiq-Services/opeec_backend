const express = require('express');
const router = express.Router();
const {
  getAdminNotifications
} = require('../controllers/adminNotificationController');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Apply admin middleware to all routes
router.use(adminMiddleware);

// Admin Notification Routes
router.get('/list', getAdminNotifications);

module.exports = router;
