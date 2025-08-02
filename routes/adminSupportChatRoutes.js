const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleWares/adminMiddleWare');

const {
  getAdminSupportConversations,
  getAdminSupportMessages,
  adminReplySupportMessage,
  markSupportResolved
} = require('../controllers/chatController');

// Apply admin middleware to all routes
router.use(adminMiddleware);

// Admin Support Chat Routes
router.get('/conversations', getAdminSupportConversations);
router.get('/messages', getAdminSupportMessages);
router.post('/reply', adminReplySupportMessage);
router.put('/mark-resolved', markSupportResolved);

module.exports = router;