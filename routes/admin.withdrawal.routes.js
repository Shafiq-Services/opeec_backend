const express = require('express');
const router = express.Router();
const adminWithdrawalController = require('../controllers/adminWithdrawalController');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Apply admin middleware to all routes
router.use(adminMiddleware);

// ---------------------- Admin Withdrawal Management Routes ----------------------

// Get all withdrawal requests for admin review
router.get('/', adminWithdrawalController.getAllWithdrawalRequests);

// Approve withdrawal request (moves from Pending to Approved)
router.post('/:id/approve', adminWithdrawalController.approveWithdrawalRequest);

// Reject withdrawal request (releases held funds)
router.post('/:id/reject', adminWithdrawalController.rejectWithdrawalRequest);

// Mark withdrawal as paid (finalizes payout)
router.post('/:id/mark-paid', adminWithdrawalController.markWithdrawalAsPaid);

module.exports = router;
