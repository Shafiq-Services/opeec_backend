const { text } = require("express");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const User = require("../models/user");
const Admin = require("../models/admin");
const Equipment = require("../models/equipment");
const Category = require("../models/categories");
const EventStore = require("../models/EventStore");
const {sendEventToUser, connectedUsers, isUserJoinedToConversation} = require("../utils/socketService");

// Helper function to get user details for socket events
async function getUserDetails(userId) {
  try {
    const user = await User.findById(userId).select('name email picture');
    if (!user) {
      // Try to find admin if user not found
      const admin = await Admin.findById(userId).select('name email profile_picture');
      if (admin) {
        return {
          _id: admin._id,
          name: admin.name,
          email: admin.email,
          picture: admin.profile_picture || null,
          userType: 'admin'
        };
      }
      return null;
    }
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      picture: user.picture || null,
      userType: 'user'
    };
  } catch (error) {
    console.error('Error fetching user details:', error);
    return null;
  }
}

// Helper function to find subcategory by ID across all categories
async function findSubCategoryById(subCategoryId) {
  try {
    const category = await Category.findOne({
      'sub_categories._id': subCategoryId
    });
    
    if (!category) return null;
    
    const subCategory = category.sub_categories.find(
      sub => sub._id.toString() === subCategoryId.toString()
    );
    
    return subCategory ? {
      ...subCategory.toObject(),
      categoryId: category._id,
      categoryName: category.name
    } : null;
  } catch (error) {
    console.error('Error finding subcategory:', error);
    return null;
  }
}

exports.getConversations = async (req, res) => {
  try {
    const userId = req.userId;

    // User's online status is managed by socket connection, no need to manually set here

    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate("lastMessage")
      .populate("equipmentId")
      .sort({ updatedAt: -1 });

    const conversationsWithDetails = await Promise.all(
      conversations.map(async (conversation) => {
        const opponent = conversation.participants.find(
          (participant) => participant.toString() !== userId.toString()
        );

        // Find opponent user (could be user or admin)
        // User model uses profile_image; Admin uses profile_picture
        let opponentUser = await User.findById(opponent).select("name profile_image email");
        if (!opponentUser) {
          // Try to find admin if user not found
          opponentUser = await Admin.findById(opponent).select("name email profile_picture");
          if (opponentUser) {
            // Normalize admin data structure to match user structure
            opponentUser = {
              _id: opponentUser._id,
              name: opponentUser.name,
              picture: opponentUser.profile_picture || null,
              email: opponentUser.email,
              userType: 'admin'
            };
          }
        } else {
          // Add userType to user data; User schema has profile_image
          opponentUser = {
            _id: opponentUser._id,
            name: opponentUser.name,
            picture: opponentUser.profile_image || null,
            email: opponentUser.email,
            userType: 'user'
          };
        }

        // Skip this conversation if opponent not found in either collection
        if (!opponentUser) {
          console.warn(`Opponent with ID ${opponent} not found in User or Admin collections`);
          return null;
        }
        
        // Get unread count for this conversation
        const unreadCount = await Message.countDocuments({
          conversation: conversation._id,
          receiver: userId,
          read: false
        });

        // Check if opponent is online
        const isOnline = connectedUsers.has(opponent.toString());

        let equipmentResponse = null;
        if (conversation.equipmentId) {
          const subCategoryData = await findSubCategoryById(conversation.equipmentId.subCategoryId);
          
          equipmentResponse = {
            _id: conversation.equipmentId._id,
            name: conversation.equipmentId.name,
            images: conversation.equipmentId.images,
            category: subCategoryData ? subCategoryData.categoryName : "Unknown",
            rental_price: conversation.equipmentId.rental_price,
            address: conversation.equipmentId.location.address,
          };
        }

        // Skip conversations with no messages
        if (!conversation.lastMessage) {
          return null;
        }

        return {
          conversationId: conversation._id,
          equipment: equipmentResponse,
          lastMessage: {
            text: conversation.lastMessage.content,
            createdAt: conversation.lastMessage.createdAt,
            sentByYou: conversation.lastMessage.sender.toString() === userId.toString(),
            status: conversation.lastMessage.status || 'sent'
          },
          opponent: {
            id: opponentUser._id,
            name: opponentUser.name,
            picture: opponentUser.picture,
            email: opponentUser.email,
            userType: opponentUser.userType,
            isOnline: isOnline
          },
          unreadCount: unreadCount,
          updatedAt: conversation.updatedAt,
        };
      })
    );

    // Filter out null conversations (where opponent wasn't found)
    const validConversations = conversationsWithDetails.filter(conv => conv !== null);

    res.json({
      message: "Conversations retrieved successfully",
      conversations: validConversations,
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

    // User's online status is managed by socket connection, no need to manually set here

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

    // Prepare equipment details only if conversation.equipmentId exists
    let equipmentResponse;
    if (conversation.equipmentId) {
      const equipment = await Equipment.findById(conversation.equipmentId);
      if (equipment) {
        const subCategoryData = await findSubCategoryById(equipment.subCategoryId);
        
        equipmentResponse = {
          _id: equipment._id,
          name: equipment.name,
          images: equipment.images,
          category: subCategoryData ? subCategoryData.categoryName : "Unknown",
          rental_price: equipment.rental_price,
          address: equipment.location.address,
          rating: 0,
        };
      }
    }

    // Only mark as read when chat is visibly opened (not when fetching in background e.g. pagination)
    const markAsRead = req.query.markAsRead !== 'false';
    const unreadMessages = markAsRead
      ? await Message.find({
          conversation: conversationId,
          receiver: userId,
          read: false
        }).select('sender _id')
      : [];

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

      // Emit "messageStatusUpdated" for each message to respective senders
      const senderIds = [...new Set(unreadMessages.map(msg => msg.sender.toString()))];
      
      for (const senderId of senderIds) {
        if (senderId !== userId) {
          const senderMessageIds = unreadMessages
            .filter(msg => msg.sender.toString() === senderId)
            .map(msg => msg._id.toString());
          
          // Emit status update for each message
          for (const messageId of senderMessageIds) {
            sendEventToUser(senderId, "messageStatusUpdated", {
              messageId: messageId,
              conversationId: conversationId,
              status: "read"
            });
          }
        }
      }
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
      conversation: {
        conversationId: conversationId,
      },
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

    const receiver = await User.findById(equipment.ownerId);
    if (!receiver) {
      return res.status(400).json({ error: "Equipment owner not found" });
    }

    const receiverId = receiver._id;
    const subCategoryData = await findSubCategoryById(equipment.subCategoryId);

    let conversation = await Conversation.findOne({ participants: { $all: [senderId, receiverId] } });
    if (!conversation) {
      conversation = new Conversation({
        participants: [senderId, receiverId],
        ...(equipmentId && { equipmentId: equipmentId }),
      });
      await conversation.save();
    } else if (equipmentId && (!conversation.equipmentId || conversation.equipmentId.toString() !== equipmentId)) {
      conversation.equipmentId = equipmentId;
      await conversation.save();
    }

    // Check if receiver has joined this conversation (to prevent unread count increment)
    const isReceiverJoined = isUserJoinedToConversation(receiverId, conversation._id);
    
    // Create message with initial status 'sent'
    const message = await new Message({
      conversation: conversation._id,
      sender: senderId,
      receiver: receiverId,
      content: text,
      status: 'sent',
      read: isReceiverJoined
    }).save();

    conversation.lastMessage = message._id;
    await conversation.save();

    // Get user details for socket events
    const senderDetails = await getUserDetails(senderId);
    const receiverDetails = await getUserDetails(receiverId);

    // Standardized newMessage payload - status is ALWAYS "sent" on initial send
    const messageData = {
      messageId: message._id.toString(),
      conversationId: conversation._id.toString(),
      text: text,
      senderId: senderId.toString(),
      receiverId: receiverId.toString(),
      createdAt: message.createdAt,
      status: "sent",
      type: "user",
      sender: senderDetails,
      receiver: receiverDetails,
      equipment: {
        id: equipment._id.toString(),
        name: equipment.name,
        images: equipment.images,
        category: subCategoryData ? subCategoryData.categoryName : "Unknown",
        rentalPrice: equipment.rental_price,
        address: equipment.location.address
      }
    };

    // Check if receiver is online
    const isReceiverOnline = connectedUsers.has(receiverId.toString());

    // 1. Emit "newMessage" to receiver (always with status "sent")
    if (isReceiverOnline) {
      sendEventToUser(receiverId, "newMessage", messageData);
    }

    // 2. Emit "messageStatusUpdated" with status "sent" to sender
    sendEventToUser(senderId, "messageStatusUpdated", {
      messageId: message._id.toString(),
      conversationId: conversation._id.toString(),
      status: "sent"
    });

    // 3. If receiver is online, update to "delivered" and notify sender
    if (isReceiverOnline) {
      await Message.findByIdAndUpdate(message._id, { status: 'delivered' });
      
      sendEventToUser(senderId, "messageStatusUpdated", {
        messageId: message._id.toString(),
        conversationId: conversation._id.toString(),
        status: "delivered"
      });
    }

    res.status(201).json({
      message: "Message sent successfully",
      conversationId: conversation._id,
      messageId: message._id,
      status: isReceiverOnline ? "delivered" : "sent"
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

    // Check if admin has joined this conversation (to prevent unread count increment)
    const isAdminJoined = isUserJoinedToConversation(adminId, conversation._id);
    
    const message = await new Message({
      conversation: conversation._id,
      sender: userId,
      receiver: adminId,
      content: text,
      status: 'sent',
      read: isAdminJoined
    }).save();

    conversation.lastMessage = message._id;
    await conversation.save();

    // Get user details for socket events
    const userDetails = await getUserDetails(userId);
    const adminDetails = await getUserDetails(adminId);

    // Check if admin is online
    const isAdminOnline = connectedUsers.has(adminId.toString());

    // Standardized newMessage payload with type: "support"
    const messageData = {
      messageId: message._id.toString(),
      conversationId: conversation._id.toString(),
      text: text,
      senderId: userId.toString(),
      receiverId: adminId.toString(),
      createdAt: message.createdAt,
      status: "sent",
      type: "support",
      sender: userDetails,
      receiver: adminDetails
    };
    
    // 1. Emit "newMessage" to admin (always with status "sent")
    if (isAdminOnline) {
      sendEventToUser(adminId, "newMessage", messageData);
    }

    // 2. Emit "messageStatusUpdated" with status "sent" to sender
    sendEventToUser(userId, "messageStatusUpdated", {
      messageId: message._id.toString(),
      conversationId: conversation._id.toString(),
      status: "sent"
    });

    // 3. If admin is online, update to "delivered" and notify sender
    if (isAdminOnline) {
      await Message.findByIdAndUpdate(message._id, { status: 'delivered' });
      
      sendEventToUser(userId, "messageStatusUpdated", {
        messageId: message._id.toString(),
        conversationId: conversation._id.toString(),
        status: "delivered"
      });
    }

    res.status(201).json({ 
      message: "Support message sent successfully",
      status: true,
      conversationId: conversation._id,
      messageId: message._id
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to send support message", details: error.message });
  }
};

// Get chat messages with admin
exports.getSupportMessages = async (req, res) => {
  try {
    const { userId } = req;
    
    // User's online status is managed by socket connection, no need to manually set here
    const admin = await Admin.findOne();
    if (!admin) return res.status(500).json({ error: "Admin not available" });

    const conversation = await Conversation.findOne({
      participants: { $all: [userId, admin._id] },
    });

    if (!conversation) {
      return res.status(200).json({ message: "No support messages found", messages: [] });
    }

    // Only mark as read when support chat screen is visibly opened
    const markAsRead = req.query.markAsRead !== 'false';
    const unreadMessages = markAsRead
      ? await Message.find({
          conversation: conversation._id,
          receiver: userId,
          read: false
        }).select('sender _id')
      : [];

    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: -1 })
      .select("-conversation -read -__v"); // Exclude fields

    if (messages.length === 0) {
      return res.status(200).json({ message: "No support messages found", messages: [] });
    }

    // AUTOMATICALLY mark messages as read for the receiver and update status
    if (unreadMessages.length > 0) {
      await Message.updateMany(
        {
          conversation: conversation._id,
          receiver: userId,
          read: false,
        },
        { 
          read: true,
          status: 'read'
        }
      );

      // Emit "messageStatusUpdated" to admin for each message
      const adminId = admin._id;
      
      const adminMessageIds = unreadMessages
        .filter(msg => msg.sender.toString() === adminId.toString())
        .map(msg => msg._id.toString());
      
      // Emit status update for each message
      for (const messageId of adminMessageIds) {
        sendEventToUser(adminId.toString(), "messageStatusUpdated", {
          messageId: messageId,
          conversationId: conversation._id.toString(),
          status: "read"
        });
      }
    }

    // Mark messages as delivered for the sender (if user is online)
    await Message.updateMany(
      {
        conversation: conversation._id,
        sender: { $ne: userId },
        status: 'sent'
      },
      { status: 'delivered' }
    );

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

// ========================= ADMIN SUPPORT CHAT FUNCTIONS =========================

// Get all support conversations for admin
exports.getAdminSupportConversations = async (req, res) => {
  try {
    const adminId = req.adminId; // From admin middleware
    
    if (!adminId) {
      return res.status(401).json({ message: "Admin authentication required" });
    }

    // Find all conversations where admin is a participant (support conversations)
    const conversations = await Conversation.find({
      participants: adminId,
    })
      .populate("lastMessage")
      .populate({
        path: "participants",
        select: "name picture email",
        match: { _id: { $ne: adminId } }
      })
      .sort({ updatedAt: -1 });

    const conversationsWithDetails = await Promise.all(
      conversations.map(async (conversation) => {
        const user = conversation.participants.find(
          (participant) => participant && participant._id.toString() !== adminId.toString()
        );

        if (!user) return null;

        // Get unread count for this conversation
        const unreadCount = await Message.countDocuments({
          conversation: conversation._id,
          receiver: adminId,
          read: false
        });

        // Check if user is online
        const isOnline = connectedUsers.has(user._id.toString());

        // Skip conversations with no messages
        if (!conversation.lastMessage) {
          return null;
        }

        return {
          _id: conversation._id,
          conversationId: conversation._id,
          user: {
            _id: user._id,
            name: user.name,
            picture: user.picture,
            email: user.email,
            isOnline: isOnline
          },
          lastMessage: {
            text: conversation.lastMessage.content,
            createdAt: conversation.lastMessage.createdAt,
            sentByAdmin: conversation.lastMessage.sender.toString() === adminId.toString(),
          },
          unreadCount: unreadCount,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        };
      })
    );

    // Filter out null values
    const validConversations = conversationsWithDetails.filter(conv => conv !== null);

    res.status(200).json({
      message: "Support conversations retrieved successfully",
      status: true,
      conversations: validConversations,
    });
  } catch (error) {
    console.error("Error in getAdminSupportConversations:", error);
    res.status(500).json({ 
      message: "Error retrieving support conversations",
      status: false,
      error: error.message 
    });
  }
};

// Get messages in a support conversation (admin view)
exports.getAdminSupportMessages = async (req, res) => {
  try {
    const adminId = req.adminId;
    const { conversationId } = req.query;
    const pageNumber = parseInt(req.query.pageNumber) || 1;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 50;
    const skip = (pageNumber - 1) * itemsPerPage;

    if (!adminId) {
      return res.status(401).json({ message: "Admin authentication required" });
    }

    if (!conversationId) {
      return res.status(400).json({ message: "Conversation ID is required" });
    }

    // Verify admin has access to this conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(adminId)) {
      return res.status(403).json({ message: "Unauthorized access to conversation" });
    }

    // Get user details in this conversation
    const userId = conversation.participants.find(id => id.toString() !== adminId.toString());
    const user = await User.findById(userId).select("name picture email");

    // Only mark as read when admin has conversation visibly open
    const markAsRead = req.query.markAsRead !== 'false';
    const unreadMessages = markAsRead
      ? await Message.find({
          conversation: conversationId,
          receiver: adminId,
          read: false
        }).select('sender _id')
      : [];

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

    // Process messages: add sentByAdmin flag
    const messagesWithAdminFlag = messages.map((message) => {
      const { _id, content, createdAt, status } = message.toObject();
      return {
        _id,
        text: content,
        createdAt,
        sentByAdmin: message.sender.toString() === adminId.toString(),
        status: status || 'sent'
      };
    });

    // Mark messages as read for admin
    if (unreadMessages.length > 0) {
      await Message.updateMany(
        {
          conversation: conversationId,
          receiver: adminId,
          read: false,
        },
        { 
          read: true,
          status: 'read'
        }
      );

      // Emit "messageStatusUpdated" to user for each message
      const userIdStr = userId.toString();
      const userMessageIds = unreadMessages
        .filter(msg => msg.sender.toString() === userIdStr)
        .map(msg => msg._id.toString());
      
      // Emit status update for each message
      for (const messageId of userMessageIds) {
        sendEventToUser(userIdStr, "messageStatusUpdated", {
          messageId: messageId,
          conversationId: conversationId,
          status: "read"
        });
      }
    }

    // Mark messages as delivered for the sender (if admin is online)
    await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: adminId },
        status: 'sent'
      },
      { status: 'delivered' }
    );

    res.status(200).json({
      message: "Support messages retrieved successfully",
      status: true,
      messages: messagesWithAdminFlag,
      user: user,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalMessages / itemsPerPage),
        totalMessages,
        hasMore: skip + messages.length < totalMessages,
      },
    });
  } catch (error) {
    console.error("Error in getAdminSupportMessages:", error);
    res.status(500).json({ 
      message: "Error retrieving support messages",
      status: false,
      error: error.message 
    });
  }
};

// Admin reply to support message
exports.adminReplySupportMessage = async (req, res) => {
  try {
    const adminId = req.adminId;
    const { conversationId, text } = req.body;

    if (!adminId) {
      return res.status(401).json({ message: "Admin authentication required" });
    }

    if (!conversationId || !text) {
      return res.status(400).json({ 
        message: "Conversation ID and message text are required",
        status: false 
      });
    }

    // Verify conversation exists and admin has access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(adminId)) {
      return res.status(403).json({ 
        message: "Unauthorized access to conversation",
        status: false 
      });
    }

    // Get the user (receiver)
    const receiverId = conversation.participants.find(id => id.toString() !== adminId.toString());
    
    // Check if user has joined this conversation (to prevent unread count increment)
    const isUserJoined = isUserJoinedToConversation(receiverId, conversationId);
    
    // Create message with initial status 'sent'
    const message = await new Message({
      conversation: conversationId,
      sender: adminId,
      receiver: receiverId,
      content: text,
      status: 'sent',
      read: isUserJoined
    }).save();

    // Update conversation's last message
    conversation.lastMessage = message._id;
    await conversation.save();

    // Get user details for socket events
    const adminDetails = await getUserDetails(adminId);
    const userDetails = await getUserDetails(receiverId);

    // Check if receiver is online
    const isReceiverOnline = connectedUsers.has(receiverId.toString());

    // Standardized newMessage payload with type: "support"
    const messageData = {
      messageId: message._id.toString(),
      conversationId: conversationId.toString(),
      text: text,
      senderId: adminId.toString(),
      receiverId: receiverId.toString(),
      createdAt: message.createdAt,
      status: "sent",
      type: "support",
      sender: adminDetails,
      receiver: userDetails
    };

    // 1. Emit "newMessage" to user (always with status "sent")
    if (isReceiverOnline) {
      sendEventToUser(receiverId, "newMessage", messageData);
    }

    // 2. Emit "messageStatusUpdated" with status "sent" to admin
    sendEventToUser(adminId, "messageStatusUpdated", {
      messageId: message._id.toString(),
      conversationId: conversationId.toString(),
      status: "sent"
    });

    // 3. If receiver is online, update to "delivered" and notify admin
    if (isReceiverOnline) {
      await Message.findByIdAndUpdate(message._id, { status: 'delivered' });
      
      sendEventToUser(adminId, "messageStatusUpdated", {
        messageId: message._id.toString(),
        conversationId: conversationId.toString(),
        status: "delivered"
      });
    }

    res.status(201).json({
      message: "Support reply sent successfully",
      status: true,
      messageId: message._id,
      messageStatus: isReceiverOnline ? "delivered" : "sent"
    });
  } catch (error) {
    console.error("Error in adminReplySupportMessage:", error);
    res.status(500).json({ 
      message: "Error sending support reply",
      status: false,
      error: error.message 
    });
  }
};

// Mark support conversation as resolved
exports.markSupportResolved = async (req, res) => {
  try {
    const adminId = req.adminId;
    const { conversationId } = req.body;

    if (!adminId) {
      return res.status(401).json({ message: "Admin authentication required" });
    }

    if (!conversationId) {
      return res.status(400).json({ 
        message: "Conversation ID is required",
        status: false 
      });
    }

    // Verify conversation exists and admin has access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(adminId)) {
      return res.status(403).json({ 
        message: "Unauthorized access to conversation",
        status: false 
      });
    }

    // Add resolved flag to conversation
    conversation.isResolved = true;
    conversation.resolvedAt = new Date();
    conversation.resolvedBy = adminId;
    await conversation.save();

    // Get the user to notify
    const userId = conversation.participants.find(id => id.toString() !== adminId.toString());

    // Get user details for socket events
    const adminDetails = await getUserDetails(adminId);
    const userDetails = await getUserDetails(userId);

    // Notify user that support ticket is resolved
    sendEventToUser(userId.toString(), "supportTicketResolved", {
      conversationId: conversationId,
      resolvedAt: conversation.resolvedAt,
      resolvedBy: adminDetails,
      user: userDetails
    });

    res.status(200).json({
      message: "Support conversation marked as resolved",
      status: true,
      resolvedAt: conversation.resolvedAt
    });
  } catch (error) {
    console.error("Error in markSupportResolved:", error);
    res.status(500).json({ 
      message: "Error marking support as resolved",
      status: false,
      error: error.message 
    });
  }
};
