const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

// Apply admin middleware to all finance routes
router.use(adminMiddleware);

// ---------------------- Finance Dashboard Routes ----------------------

/**
 * Get withdrawals for finance dashboard with all details included
 * GET /admin/finance/withdrawals
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10)
 * - status: Filter by status (Pending, Approved, Paid, Rejected)
 */
router.get('/withdrawals', financeController.getWithdrawalsForFinanceDashboard);

/**
 * Get Stripe transfer details for admin view
 * GET /admin/finance/stripe-transfer-details/:orderId
 */
router.get('/stripe-transfer-details/:orderId', financeController.getStripeTransferDetails);

/**
 * Approve withdrawal request from finance dashboard
 * POST /admin/finance/withdrawals/approve
 * Query params: { id: string }
 * Body: { transaction_id: string, screenshot_url?: string }
 */
router.post('/withdrawals/approve', financeController.approveWithdrawal);

/**
 * Reject withdrawal request from finance dashboard
 * POST /admin/finance/withdrawals/reject
 * Query params: { id: string }
 * Body: { rejection_reason: string }
 */
router.post('/withdrawals/reject', financeController.rejectWithdrawal);

module.exports = router;
