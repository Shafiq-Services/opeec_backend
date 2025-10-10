const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const adminVerificationController = require('../controllers/adminVerificationController');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Apply admin middleware to all routes
router.use(adminMiddleware);

// User Management Routes
router.put('/approve', userController.approveUser);
router.put('/reject', userController.rejectUser);
router.put('/block', userController.blockUser);
router.put('/unblock', userController.unBlockUser);
router.get('/all', userController.getAllUsers);
router.get('/search', userController.searchUsers);

router.put('/update-profile', userController.updateUserProfileByAdmin);

// Stripe Verification Admin Routes
router.get('/verification-filter', adminVerificationController.getUsersByVerificationStatus);
router.get('/:userId/verification-history', adminVerificationController.getUserVerificationHistory);

module.exports = router; 