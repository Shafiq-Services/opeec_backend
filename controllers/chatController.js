const { text } = require("express");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const User = require("../models/User");
const Admin = require("../models/admin");
const Equipment = require("../models/equipment");
const Categories = require("../models/categories");
const SubCategory = require("../models/sub_categories");
const EventStore = require("../models/EventStore");
const {sendEventToUser} = require("../utils/socketService");

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
      .select("name profile_image")
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
        picture: opponentsMap[conv.opponentId]?.profile_image || "",
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
          _id: equipment._id,
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
    const { userId: senderId, query: { equipmentId }, body: { text } } = req;
    if (!equipmentId || !text)
      return res.status(400).json({ error: "Equipment ID and text are required" });

    const equipment = await Equipment.findById(equipmentId);
    const receiver = await User.findById(equipment.owner_id);
    const receiverId = receiver._id;
    const subCategory = await SubCategory.findById(equipment.sub_category_fk);
    const category = await Categories.findById(subCategory.category_id);

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

    const equipmentData = {
      id: equipment._id,
      name: equipment.name,
      images: equipment.images,
      category: category.name,
      rentalPrice: equipment.rental_price,
      address: equipment.custom_location.address,
      rating: equipment.average_rating,
    };

    // Store event persistently
    await EventStore.findOneAndUpdate(
      { key: conversation._id.toString() },
      { eventData: equipmentData },
      { upsert: true, new: true }
    );

    const message = await new Message({
      conversation: conversation._id,
      sender: senderId,
      receiver: receiverId,
      content: text,
    }).save();

    conversation.lastMessage = message._id;
    await conversation.save();

    //Send Socket to the receiver
    // sendEventToUser(receiverId, "eventSaved", {
    //   key: conversation._id,
    //   eventData: equipmentData,
    // });

    res.status(201).json({
      message: "Message sent successfully",
      conversationId: conversation._id,
    });
  } catch (error) {
    console.error("Error in sendMessage:", error);
    res.status(500).json({ error: "Unable to send message", details: error.message });
  }
};


exports.sendSupportMessage = async (req, res) => {
  try {
    const { userId } = req; // Authenticated user
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Message text is required" });

    // Find an admin (Assuming a single admin for now)
    const admin = await Admin.findOne();
    if (!admin) return res.status(500).json({ error: "Admin not available" });

    const adminId = admin._id;

    let conversation = await Conversation.findOne({
      participants: { $all: [userId, adminId] },
    });

    if (!conversation) {
      conversation = new Conversation({
        participants: [userId, adminId],
      });
      await conversation.save();
    }

    const message = await new Message({
      conversation: conversation._id,
      sender: userId,
      receiver: adminId,
      content: text,
    }).save();

    conversation.lastMessage = message._id;
    await conversation.save();

    // Notify admin via socket
    // sendEventToUser(adminId, "newSupportMessage", { conversationId: conversation._id, message: text });

    res.status(201).json({ message: "Support message sent successfully" });
  } catch (error) {
    res.status(500).json({ error: "Unable to send support message", details: error.message });
  }
};

// Get chat messages with admin
exports.getSupportMessages = async (req, res) => {
  try {
    const { userId } = req;
    const admin = await Admin.findOne();
    if (!admin) return res.status(500).json({ error: "Admin not available" });

    const conversation = await Conversation.findOne({
      participants: { $all: [userId, admin._id] },
    });

    if (!conversation) {
      return res.status(200).json({ message: "No support messages found", messages: [] });
    }

    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: -1 })
      .select("-conversation -read -__v"); // Exclude fields

    if (messages.length === 0) {
      return res.status(200).json({ message: "No support messages found", messages: [] });
    }

    res.status(200).json({ message: "Support messages retrieved successfully", messages });
  } catch (error) {
    res.status(500).json({ error: "Unable to retrieve messages", details: error.message });
  }
};
