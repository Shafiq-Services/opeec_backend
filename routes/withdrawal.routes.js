const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const { userMiddleware } = require('../middlewares/user');

// Apply user middleware to all withdrawal routes
router.use(userMiddleware);

// ---------------------- Seller Withdrawal Routes ----------------------

// Create withdrawal request
router.post('/', withdrawalController.createWithdrawalRequest);

// Get seller's own withdrawal requests
router.get('/', withdrawalController.getWithdrawalRequests);

module.exports = router;
