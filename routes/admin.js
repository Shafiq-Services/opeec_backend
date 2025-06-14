const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin');
const userController = require('../controllers/user');
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

// User Management Routes
router.put('/users/approve', userController.approveUser);
router.put('/users/reject', userController.rejectUser);
router.put('/users/block', userController.blockUser);
router.put('/users/unblock', userController.unBlockUser);
router.get('/users/sellers', userController.getAllUsers);

module.exports = router;
