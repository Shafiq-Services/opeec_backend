const express = require('express');
const router = express.Router();
const adminStripeMonitoringController = require('../controllers/adminStripeMonitoringController');
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

/**
 * Admin Stripe Monitoring Routes
 * Read-only dashboard for monitoring automated Stripe Connect transfers
 * All routes require admin authentication
 */

/**
 * @route   GET /admin/stripe-connect/accounts
 * @desc    Get all Stripe Connect accounts (equipment owners)
 * @access  Protected (Admin)
 * @query   { status: 'active|pending|disabled', limit: 50, offset: 0 }
 */
router.get('/accounts', adminMiddleware, adminStripeMonitoringController.getAllConnectAccounts);

/**
 * @route   GET /admin/stripe-connect/transfers
 * @desc    Get all Stripe transfers (automated payouts)
 * @access  Protected (Admin)
 * @query   { status: 'pending|processing|completed|failed', user_id: 'userId', limit: 50, offset: 0 }
 */
router.get('/transfers', adminMiddleware, adminStripeMonitoringController.getAllTransfers);

/**
 * @route   GET /admin/stripe-connect/statistics
 * @desc    Get transfer statistics summary
 * @access  Protected (Admin)
 * @returns Dashboard statistics (total transferred, failed count, active accounts, etc.)
 */
router.get('/statistics', adminMiddleware, adminStripeMonitoringController.getTransferStatistics);

/**
 * @route   GET /admin/stripe-connect/transfer/:orderId
 * @desc    Get specific transfer details
 * @access  Protected (Admin)
 * @returns Complete transfer information for an order
 */
router.get('/transfer/:orderId', adminMiddleware, adminStripeMonitoringController.getTransferDetails);

/**
 * @route   GET /admin/stripe-connect/user-payouts/:userId
 * @desc    Get user's (owner's) complete payout history
 * @access  Protected (Admin)
 * @query   { limit: 20 }
 * @returns All payouts for a specific equipment owner
 */
router.get('/user-payouts/:userId', adminMiddleware, adminStripeMonitoringController.getUserPayoutHistory);

module.exports = router;

