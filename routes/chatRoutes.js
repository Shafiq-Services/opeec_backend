const express = require("express");
const router = express.Router();
const { userMiddleware } = require("../middleWares/user");

const {
  getMessages,
  getConversations,
  sendMessage,
  sendSupportMessage,
  getSupportMessages
} = require("../controllers/chatController");

router.use(userMiddleware);
// Chat routes
router.get("/conversations", getConversations);
router.get("/messages", getMessages);
router.post("/send", sendMessage);
router.post("/support/send", sendSupportMessage);
router.get("/support/messages", getSupportMessages);
module.exports = router;
