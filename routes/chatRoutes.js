const express = require("express");
const router = express.Router();
const { commonMiddleware } = require("../middleWares/common");

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
router.get("/conversations", commonMiddleware, getConversations);
router.get("/messages", commonMiddleware, getMessages);
router.post("/send", commonMiddleware, sendMessage);

// Support chat routes (user middleware applied)
router.post("/support/send", commonMiddleware, sendSupportMessage);
router.get("/support/messages", commonMiddleware, getSupportMessages);

// Online users (user middleware applied)
router.get("/online-users", commonMiddleware, getOnlineUsers);

module.exports = router;
