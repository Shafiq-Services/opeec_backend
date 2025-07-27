const express = require('express');
const router = express.Router();
const appSettingsController = require('../controllers/appSettingsController');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Apply admin middleware to all routes
router.use(adminMiddleware);

// GET: Get app settings
router.get('/', appSettingsController.getAppSettings);

// PUT: Create or update app settings
router.put('/', appSettingsController.updateAppSettings);

module.exports = router; 