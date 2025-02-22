const { text } = require("express");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const User = require("../models/User");
const Equipment = require("../models/equipment");
const Categories = require("../models/categories");
const SubCategory = require("../models/sub_categories");

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

    // Retrieve the conversation and ensure it exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res
        .status(403)
        .json({ error: "Conversation not found" });
    }

    // Prepare equipment details only if conversation.equipment exists
    let equipmentResponse;
    if (conversation.equipment) {
      const equipment = await Equipment.findById(conversation.equipment);
      if (equipment) {
        const subCategory = await SubCategory.findById(equipment.sub_category_fk);
        const category = subCategory && await Categories.findById(subCategory.category_id);
        
        equipmentResponse = {
          name: equipment.name,
          images: equipment.images,
          category: category ? category.name : "Unknown",
          rental_price: equipment.rental_price,
          address: equipment.custom_location.address,
          rating: 0,
        };
      }
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

    // Process messages: remove unnecessary fields and add a sentByYou flag
    const messagesWithSentByYou = messages.map((message) => {
      const { _id, content, createdAt } = message.toObject();
      return {
        _id,
        text: content,
        createdAt,
        sentByYou: message.sender.toString() === userId.toString(),
      };
    });

    // Mark messages as read for the receiver
    await Message.updateMany(
      {
        conversation: conversationId,
        receiver: userId,
        read: false,
      },
      { read: true }
    );

    // Build the response object
    const response = {
      message: "Messages retrieved successfully",
      messages: messagesWithSentByYou,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalMessages / itemsPerPage),
        totalMessages,
        hasMore: skip + messages.length < totalMessages,
      },
    };

    // Add equipment info only if it was retrieved
    if (equipmentResponse) {
      response.equipment = equipmentResponse;
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};


exports.sendMessage = async (req, res) => {
  try {
    const { userId: senderId, query: { receiverId, equipmentId }, body: { text } } = req;
    if (!receiverId || !text)
      return res.status(400).json({ error: "Receiver ID and text are required" });

    const receiver = await User.findById(receiverId);
    if (!receiver)
      return res.status(404).json({ error: "Receiver not found" });

    let conversation = await Conversation.findOne({ participants: { $all: [senderId, receiverId] } });
    if (!conversation) {
      conversation = new Conversation({
        participants: [senderId, receiverId],
        ...(equipmentId && { equipment: equipmentId }),
      });
      await conversation.save();
    } else if (equipmentId && (!conversation.equipment || conversation.equipment.toString() !== equipmentId)) {
      conversation.equipment = equipmentId;
      await conversation.save();
    }

    const message = await new Message({
      conversation: conversation._id,
      sender: senderId,
      receiver: receiverId,
      content: text,
    }).save();

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

