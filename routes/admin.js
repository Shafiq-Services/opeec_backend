const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Admin Login with OTP
router.post('/send-login-otp', adminController.sendLoginOtp);
router.post('/verify-login-otp', adminController.verifyLoginOtp);

// Legacy Admin Login (kept for compatibility)
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

// Send Notification to User
router.post('/send_notification', adminController.sendNotification);

// Send Bulk Notifications
router.post('/send_bulk_notification', adminController.sendBulkNotification);

module.exports = router;
