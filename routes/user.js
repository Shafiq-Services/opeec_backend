const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const { userMiddleware } = require("../middleWares/user");
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// ---------------------- Customer Routes ----------------------

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

// Use userMiddleware for common user routes
router.use(userMiddleware);

router.get('/profile', userController.getprofile);

// Update user profile
router.put('/update', userController.updateUser);

// Resend ID card selfie for verification
router.put('/resend_id_card_selfie', userController.resendIdCardSelfie);

// ---------------------- Admin Routes ----------------------

router.use(adminMiddleware);

// Approve User
router.put('/approve_user', userController.approveUser);

// Reject User with Reason
router.put('/reject_user', userController.rejectUser);

// Block User with Reason
router.put('/block_user', userController.blockUser);

// Block User with Reason
router.put('/unblock_user', userController.blockUser);

module.exports = router;
