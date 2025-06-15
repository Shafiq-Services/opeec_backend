const express = require("express");
const router = express.Router();
const { userMiddleware } = require("../middleWares/user");
const { adminMiddleware } = require("../middleWares/admin");

const {
  getMessages,
  getConversations,
  sendMessage,
  sendSupportMessage,
  getSupportMessages,
  getOnlineUsers,
  searchUsers,
  searchEquipment
} = require("../controllers/chatController");

// Chat routes (user middleware applied)
router.get("/conversations", userMiddleware, getConversations);
router.get("/messages", userMiddleware, getMessages);
router.post("/send", userMiddleware, sendMessage);

// Support chat routes (user middleware applied)
router.post("/support/send", userMiddleware, sendSupportMessage);
router.get("/support/messages", userMiddleware, getSupportMessages);

// Online users (user middleware applied)
router.get("/online-users", userMiddleware, getOnlineUsers);

// Search routes (admin middleware applied)
router.get("/search-users", adminMiddleware, searchUsers);
router.get("/search-equipment", adminMiddleware, searchEquipment);

module.exports = router;
