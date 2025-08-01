const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const { userMiddleware } = require("../middleWares/user");

// ---------------------- Public Routes ----------------------

// User Signup Route
router.post('/signup', userController.signup);

// User Login Route
router.post('/login', userController.login);

// Send OTP for email verification
router.post('/send_otp', userController.sendOtp);

// Verify user OTP for email verification
router.post('/verify_user_otp', userController.verifyUserOtp);

// Send OTP for password reset
router.post('/forgot_or_reset_password_otp', userController.forgotOrResetPasswordOtp);

// Reset user password
router.post('/reset_password', userController.resetPassword);

// ---------------------- Protected User Routes ----------------------

// Apply user middleware to user routes
router.use(userMiddleware);

router.get('/profile', userController.getprofile);

// Update user profile
router.put('/update', userController.updateUser);

// Resend ID card selfie for verification
router.put('/resend_id_card_selfie', userController.resendIdCardSelfie);

router.get('/get_fcm', userController.getFCMToken);

module.exports = router;
