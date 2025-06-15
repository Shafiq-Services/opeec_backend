const { text } = require("express");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const User = require("../models/user");
const Admin = require("../models/admin");
const Equipment = require("../models/equipment");
const Categories = require("../models/categories");
const SubCategory = require("../models/sub_categories");
const EventStore = require("../models/EventStore");
const {sendEventToUser, connectedUsers} = require("../utils/socketService");

exports.getConversations = async (req, res) => {
  try {
    const userId = req.userId;

    // Mark user as online when they access conversations
    connectedUsers.set(userId, Date.now());

    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate("lastMessage")
      .populate("equipment")
      .sort({ updatedAt: -1 });

    const conversationsWithDetails = await Promise.all(
      conversations.map(async (conversation) => {
        const opponent = conversation.participants.find(
          (participant) => participant.toString() !== userId.toString()
        );

        const opponentUser = await User.findById(opponent).select("name picture");
        
        // Get unread count for this conversation
        const unreadCount = await Message.countDocuments({
          conversation: conversation._id,
          receiver: userId,
          read: false
        });

        // Check if opponent is online
        const isOnline = connectedUsers.has(opponent.toString());

        let equipmentResponse = null;
        if (conversation.equipment) {
          const subCategory = await SubCategory.findById(conversation.equipment.sub_category_fk);
          const category = subCategory && await Categories.findById(subCategory.category_id);
          
          equipmentResponse = {
            _id: conversation.equipment._id,
            name: conversation.equipment.name,
            images: conversation.equipment.images,
            category: category ? category.name : "Unknown",
            rental_price: conversation.equipment.rental_price,
            address: conversation.equipment.custom_location.address,
          };
        }

        return {
          conversationId: conversation._id,
          equipment: equipmentResponse,
          lastMessage: conversation.lastMessage
            ? {
                text: conversation.lastMessage.content,
                createdAt: conversation.lastMessage.createdAt,
                sentByYou: conversation.lastMessage.sender.toString() === userId.toString(),
              }
            : null,
          opponent: {
            id: opponentUser._id,
            name: opponentUser.name,
            picture: opponentUser.picture,
            isOnline: isOnline
          },
          unreadCount: unreadCount,
          updatedAt: conversation.updatedAt,
        };
      })
    );

    res.json({
      message: "Conversations retrieved successfully",
      conversations: conversationsWithDetails,
    });
  } catch (error) {
    console.error("Error in getConversations:", error);
    res.status(500).json({ error: "Server error" });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const userId = req.userId;
    const { conversationId } = req.query;
    const pageNumber = parseInt(req.query.pageNumber) || 1;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 50;
    const skip = (pageNumber - 1) * itemsPerPage;

    // Mark user as online when they access messages
    connectedUsers.set(userId, Date.now());

    // Retrieve the conversation and ensure it exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(403).json({ error: "Conversation not found" });
    }

    // Check if user is participant in conversation
    const isParticipant = conversation.participants.includes(userId);
    if (!isParticipant) {
      return res.status(403).json({ error: "Unauthorized access to conversation" });
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

    // Get unread messages that will be marked as read
    const unreadMessages = await Message.find({
      conversation: conversationId,
      receiver: userId,
      read: false
    }).select('sender _id');

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
      const { _id, content, createdAt, status } = message.toObject();
      return {
        _id,
        text: content,
        createdAt,
        sentByYou: message.sender.toString() === userId.toString(),
        status: status || 'sent'
      };
    });

    // AUTOMATICALLY mark messages as read for the receiver and update status
    if (unreadMessages.length > 0) {
      await Message.updateMany(
        {
          conversation: conversationId,
          receiver: userId,
          read: false,
        },
        { 
          read: true,
          status: 'read'
        }
      );

      // Emit read receipts to senders via socket
      const senderIds = [...new Set(unreadMessages.map(msg => msg.sender.toString()))];
      senderIds.forEach(senderId => {
        if (senderId !== userId) {
          const readMessageIds = unreadMessages
            .filter(msg => msg.sender.toString() === senderId)
            .map(msg => msg._id);
          
          sendEventToUser(senderId, "messagesRead", {
            conversationId: conversationId,
            messageIds: readMessageIds,
            readBy: userId
          });
        }
      });
    }

    // Mark messages as delivered for the sender (if receiver is online)
    await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: userId },
        status: 'sent'
      },
      { status: 'delivered' }
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
    console.error("Error in getMessages:", error);
    res.status(500).json({ error: "Server error" });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { userId: senderId, query: { equipmentId }, body: { text } } = req;
    if (!equipmentId || !text)
      return res.status(400).json({ error: "Equipment ID and text are required" });

    const equipment = await Equipment.findById(equipmentId);
    if (!equipment) {
      return res.status(400).json({ error: "Equipment not found" });
    }

    const receiver = await User.findById(equipment.owner_id);
    if (!receiver) {
      return res.status(400).json({ error: "Equipment owner not found" });
    }

    const receiverId = receiver._id;
    const subCategory = await SubCategory.findById(equipment.sub_category_fk);
    const category = subCategory && await Categories.findById(subCategory.category_id);

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

    // Create message with initial status 'sent'
    const message = await new Message({
      conversation: conversation._id,
      sender: senderId,
      receiver: receiverId,
      content: text,
      status: 'sent'
    }).save();

    conversation.lastMessage = message._id;
    await conversation.save();

    // Check if receiver is online and update status accordingly
    const isReceiverOnline = connectedUsers.has(receiverId.toString());
    let messageStatus = 'sent';
    
    if (isReceiverOnline) {
      messageStatus = 'delivered';
      await Message.findByIdAndUpdate(message._id, { status: 'delivered' });
    }

    // Emit socket events
    const messageData = {
      _id: message._id,
      conversationId: conversation._id,
      text: text,
      senderId: senderId,
      receiverId: receiverId,
      createdAt: message.createdAt,
      status: messageStatus,
      equipment: {
        id: equipment._id,
        name: equipment.name,
        images: equipment.images,
        category: category ? category.name : "Unknown",
        rental_price: equipment.rental_price,
        address: equipment.custom_location.address
      }
    };

    // Emit to receiver if online
    if (isReceiverOnline) {
      sendEventToUser(receiverId, "newMessage", messageData);
      
      // Emit delivery confirmation to sender
      sendEventToUser(senderId, "messageDelivered", {
        messageId: message._id,
        status: 'delivered'
      });
    }

    // Emit to sender for confirmation
    sendEventToUser(senderId, "messageSent", {
      messageId: message._id,
      conversationId: conversation._id,
      status: messageStatus
    });

    res.status(201).json({
      message: "Message sent successfully",
      conversationId: conversation._id,
      messageId: message._id,
      status: messageStatus
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

// Get online users
exports.getOnlineUsers = async (req, res) => {
  try {
    const onlineUserIds = Array.from(connectedUsers.keys());
    
    res.status(200).json({
      status: "success",
      onlineUsers: onlineUserIds
    });
  } catch (error) {
    console.error("Error getting online users:", error);
    res.status(500).json({ error: "Server error" });
  }
};
