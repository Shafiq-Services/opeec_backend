const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Admin Login
router.post('/login', adminController.login);

router.post('/forgot-password', adminController.sendOtpForPasswordReset);

router.post('/verify_otp', adminController.verifyOtpForPasswordReset);

router.post('/reset_password', adminController.updatePassword);

// Use adminMiddleware for protected routes
router.use(adminMiddleware);

// Get Admin Profile
router.get('/profile', adminController.getProfile);

// Update Admin Profile
router.put('/update', adminController.updateProfile);

// Get Admin FCM Token
router.get('/get_fcm', adminController.getFCMToken);

module.exports = router;
