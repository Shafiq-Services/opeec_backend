const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const { userMiddleware } = require("../middleWares/user");
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Create separate routers for admin and user routes
const adminRouter = express.Router();
const userRouter = express.Router();

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

// ---------------------- Admin Routes ----------------------

// Apply admin middleware to admin routes
adminRouter.use(adminMiddleware);

// Approve User
adminRouter.put('/approve_user', userController.approveUser);

// Reject User with Reason
adminRouter.put('/reject_user', userController.rejectUser);

// Block User with Reason
adminRouter.put('/block_user', userController.blockUser);

// Unblock User
adminRouter.put('/unblock_user', userController.unBlockUser);

// Get all sellers
adminRouter.get('/get_all_users', userController.getAllUsers);

adminRouter.get('/search', userController.searchUsers);

// Update user profile by admin
adminRouter.put('/update_user_profile', userController.updateUserProfileByAdmin);

// ---------------------- Protected User Routes ----------------------

// Apply user middleware to user routes
userRouter.use(userMiddleware);

userRouter.get('/profile', userController.getprofile);

// Update user profile
userRouter.put('/update', userController.updateUser);

// Resend ID card selfie for verification
userRouter.put('/resend_id_card_selfie', userController.resendIdCardSelfie);

userRouter.get('/get_fcm', userController.getFCMToken);

// Mount the routers at different sub-paths to avoid conflicts
router.use('/admin', adminRouter);  // Admin routes at /user/admin/*
router.use('/', userRouter);        // User routes at /user/*

module.exports = router;
