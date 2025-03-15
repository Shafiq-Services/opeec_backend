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
    console.log(`[INFO] Request received for userId: ${userId}`);

    // Fetch all messages involving the user and populate the conversation field
    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }]
    })
      .populate({
        path: "conversation",
        select: "participants", // Only get participants field
      })
      .sort({ createdAt: -1 }) // Sort by recent messages
      .lean();

    console.log(`[DEBUG] Total messages fetched: ${messages.length}`);

    const conversationsMap = {};

    // Group messages by conversation and collect details
    messages.forEach((msg, index) => {
      if (!msg.conversation) {
        console.warn(`[WARN] Skipping message at index ${index} - Conversation missing`);
        return;
      }

      const convId = msg.conversation._id.toString();
      console.log(`[DEBUG] Processing message ${index}: Conversation ID: ${convId}`);

      if (!conversationsMap[convId]) {
        // Find the opponent by filtering out the current user
        const opponentId = msg.conversation.participants.find(
          (id) => id.toString() !== userId
        );

        if (!opponentId) {
          console.warn(`[WARN] No opponent found for conversation ${convId}`);
          return;
        }

        conversationsMap[convId] = {
          conversationId: convId,
          lastMessage: msg.content,
          lastMessageTime: msg.createdAt,
          opponentId: opponentId.toString(),
        };

        console.log(`[INFO] New conversation added: ${convId} with opponent ${opponentId}`);
      }
    });

    const conversations = Object.values(conversationsMap);
    console.log(`[INFO] Total unique conversations found: ${conversations.length}`);

    // Fetch opponent details
    const opponentIds = conversations.map((c) => c.opponentId);
    console.log(`[DEBUG] Fetching details for opponent IDs:`, opponentIds);

    const opponents = await User.find({ _id: { $in: opponentIds } })
      .select("name profile_image")
      .lean();

    console.log(`[DEBUG] Total opponents fetched: ${opponents.length}`);

    // Map opponent details to conversations
    const opponentsMap = {};
    opponents.forEach((opponent) => {
      opponentsMap[opponent._id.toString()] = opponent;
      console.log(`[INFO] Opponent mapped: ${opponent._id} -> ${opponent.name}`);
    });

    const formattedConversations = conversations.map((conv) => ({
      ...conv,
      opponent: {
        id: conv.opponentId,
        name: opponentsMap[conv.opponentId]?.name || "",
        picture: opponentsMap[conv.opponentId]?.profile_image || "",
      },
    }));

    // Remove opponentId from each conversation object
    const finalConversations = formattedConversations.map(({ opponentId, ...rest }) => rest);

    // Sort conversations by lastMessageTime
    finalConversations.sort(
      (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
    );

    console.log(`[INFO] Conversations successfully processed and sorted.`);

    res.status(200).json({ status: "success", data: finalConversations });
  } catch (error) {
    console.error(`[ERROR] getConversations failed:`, error.message);
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
