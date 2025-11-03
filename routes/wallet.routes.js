const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { userMiddleware } = require('../middleWares/user');

// Apply user middleware to all wallet routes
router.use(userMiddleware);

// ---------------------- Seller Wallet Routes ----------------------

// Get wallet information (balances + history)
router.get('/', walletController.getWalletInfo);

// Refresh wallet balances (force recomputation)
router.post('/refresh', walletController.refreshWallet);

module.exports = router;
