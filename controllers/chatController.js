const { text } = require("express");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const User = require("../models/User");

exports.getConversations = async (req, res) => {
  try {
    const userId = req.userId; // Extracted from auth token

    // Fetch all messages involving the user
    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }]
    })
      .sort({ createdAt: -1 }) // Sort by recent messages
      .lean();

    const conversationsMap = {};

    // Group messages by conversation and collect details
    messages.forEach((msg) => {
      const convId = msg.conversation.toString();
      if (!conversationsMap[convId]) {
        conversationsMap[convId] = {
          conversationId: convId,
          lastMessage: msg.content,
          lastMessageTime: msg.createdAt,
          // lastMessageRead: msg.receiver.toString() === userId ? msg.read : true,
          opponentId:
            msg.sender.toString() === userId ? msg.receiver : msg.sender,
          // unreadCount: 0,
        };
      }
      // if (
      //   msg.receiver.toString() === userId &&
      //   !msg.read
      // ) {
      //   conversationsMap[convId].unreadCount++;
      // }
    });

    const conversations = Object.values(conversationsMap);

    // Fetch opponent details
    const opponentIds = conversations.map((c) => c.opponentId);
    const opponents = await User.find({ _id: { $in: opponentIds } })
      .select("name picture")
      .lean();

    // Map opponent details to conversations
    const opponentsMap = {};
    opponents.forEach((opponent) => {
      opponentsMap[opponent._id] = opponent;
    });

    const formattedConversations = conversations.map((conv) => ({
      ...conv,
      opponent: {
        id: conv.opponentId, // Include opponent ID inside the opponent object
        name: opponentsMap[conv.opponentId]?.name || "",
        picture: opponentsMap[conv.opponentId]?.picture || "",
      },
    }));

    // Remove opponentId from each conversation object
    const finalConversations = formattedConversations.map((conv) => {
      const { opponentId, ...rest } = conv;
      return rest;
    });

    // Sort conversations by lastMessageTime
    finalConversations.sort(
      (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
    );

    res.status(200).json({ status: "success", data: finalConversations });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};



exports.getMessages = async (req, res) => {
  try {
    const userId = req.userId;
    const { conversationId } = req.query;
    const pageNumber = parseInt(req.query.pageNumber) || 1;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 50;
    const skip = (pageNumber - 1) * itemsPerPage;

    // Check if the user is authorized to view this conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res
        .status(403)
        .json({ error: "Conversation not found" });
    }

    // Fetch messages for the conversation
    const messages = await Message.find({
      conversation: conversationId,
    })
      .select("-__v -updatedAt -conversation")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(itemsPerPage);

    const totalMessages = await Message.countDocuments({
      conversation: conversationId,
    });

    // Process messages: Remove sender, receiver, and read fields
    const messagesWithSentByYou = messages.map((message) => {
      const { _id, content, createdAt } = message.toObject();
      return {
        _id,
        text: content,
        createdAt,
        sentByYou: message.sender.toString() === userId.toString(),
      };
    });

    // Mark messages as read
    await Message.updateMany(
      {
        conversation: conversationId,
        receiver: userId,
        read: false,
      },
      { read: true }
    );

    // Respond with the messages and pagination
    res.json({
      message: "Messages retrieved successfully",
      messages: messagesWithSentByYou,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalMessages / itemsPerPage),
        totalMessages,
        hasMore: skip + messages.length < totalMessages,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.userId;
    const { receiverId } = req.query; // Get receiverId from the query
    const { text } = req.body;

    // Validate required fields
    if (!receiverId || !text) {
      return res.status(400).json({ error: "Receiver ID and text are required" });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ error: "Receiver not found" });
    }
    
    // Check if a conversation already exists between sender and receiver
    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] }, // Check for both participants
    });

    // If no conversation exists, create a new one
    if (!conversation) {
      conversation = new Conversation({
        participants: [senderId, receiverId],
      });
      await conversation.save();
    }

    // Create and save the message
    const message = new Message({
      conversation: conversation._id,
      sender: senderId,
      receiver: receiverId,
      content: text,
    });

    await message.save();

    // Update the conversation's last message
    conversation.lastMessage = message._id;
    await conversation.save();

    res.status(201).json({
      message: "Message sent successfully",
      conversationId: conversation._id,
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to send message", details: error.message });
  }
};
