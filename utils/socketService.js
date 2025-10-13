const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Admin = require("../models/admin");
const EventStore = require("../models/EventStore");

const JWT_SECRET = process.env.JWT_SECRET || "Opeec";
const connectedUsers = new Map();
const typingUsers = new Map();
const joinedConversations = new Map(); // userId -> Set of conversationIds

let io;

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

const sendEventToUser = (userId, event, data) => {
  console.log(`Connected Users (${connectedUsers.size}):`, Array.from(connectedUsers.entries()));
  const socketId = connectedUsers.get(userId.toString());
  if (socketId) {
    io.to(socketId).emit(event, data);
    console.log(`Event "${event}" sent to user ${userId}:`, data);
  } else {
    console.warn(`User with ID ${userId} is not connected. Available users: [${Array.from(connectedUsers.keys()).join(', ')}]`);
  }
};

const saveEvent = (key, data) => {
    console.log("Emitting saveEvent with key:", key, "data:", data);
    io.emit("eventSaved", { key, eventData: data });
    console.log("Event Saved");
};

// Send unread admin notifications count
const sendAdminUnreadCount = async (adminId) => {
  try {
    const AdminNotification = require('../models/adminNotification');
    const unreadCount = await AdminNotification.countDocuments({ isRead: false });
    
    sendEventToUser(adminId, 'adminNotificationUnreadCount', { unreadCount });
    console.log(`📊 Sent unread count ${unreadCount} to admin ${adminId}`);
  } catch (error) {
    console.error('Error sending admin unread count:', error);
  }
};

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", 
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ["websocket", "polling"]
  });

  console.log("Socket server initialized...");

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      console.error("Socket connection denied: Token missing");
      return next(new Error("Token missing"));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Handle both user and admin tokens
      const userId = decoded.userId || decoded.adminId;
      const userType = decoded.userId ? 'user' : 'admin';
      
      if (!userId) {
        console.error("Socket connection denied: Invalid token structure", decoded);
        return next(new Error("Invalid token structure"));
      }
      
      socket.userId = userId;
      socket.userType = userType;
      console.log(`Socket authenticated for ${userType}: ${userId}`);
      next();
    } catch (error) {
      console.error("Socket connection denied: Invalid or expired token", error);
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    const userType = socket.userType;
    connectedUsers.set(userId.toString(), socket.id);
    console.log(`${userType.charAt(0).toUpperCase() + userType.slice(1)} connected: ${userId}, Socket ID: ${socket.id}`);

    // Send unread count to admin when they connect
    if (userType === 'admin') {
      sendAdminUnreadCount(userId.toString());
    }

    // Automatically notify user's contacts that they are online
    socket.broadcast.emit("userOnline", { userId, userType });

    // Simplified chat events - only what frontend needs to emit
    socket.on("joinConversation", ({ conversationId }) => {
      socket.join(`conversation_${conversationId}`);
      
      // Track that user has joined this conversation
      const userIdStr = userId.toString();
      if (!joinedConversations.has(userIdStr)) {
        joinedConversations.set(userIdStr, new Set());
      }
      joinedConversations.get(userIdStr).add(conversationId);
      
      console.log(`User ${userId} joined conversation ${conversationId}`);
    });

    socket.on("leaveConversation", ({ conversationId }) => {
      socket.leave(`conversation_${conversationId}`);
      
      // Track that user has left this conversation
      const userIdStr = userId.toString();
      if (joinedConversations.has(userIdStr)) {
        joinedConversations.get(userIdStr).delete(conversationId);
        if (joinedConversations.get(userIdStr).size === 0) {
          joinedConversations.delete(userIdStr);
        }
      }
      
      console.log(`User ${userId} left conversation ${conversationId}`);
    });

    // ---------------------- VERIFICATION STATUS REQUESTS ----------------------
    
    /**
     * Handle verification status request from app
     * App can emit 'requestVerificationStatus' to get current status
     */
    socket.on("requestVerificationStatus", async () => {
      try {
        console.log(`📱 User ${userId} requested verification status via socket`);
        
        const User = require("../models/user");
        const user = await User.findById(userId).select('stripe_verification isUserVerified');
        
        if (!user) {
          socket.emit("verificationStatusResponse", {
            error: "User not found",
            status: "error"
          });
          return;
        }

        const verificationData = user.stripe_verification || {};
        
        // Prepare response with current verification status
        const response = {
          verification_status: verificationData.status || 'not_verified',
          verified_at: verificationData.verified_at || '',
          session_id: verificationData.session_id || '',
          last_attempt_at: verificationData.last_attempt_at || '',
          fee_paid: verificationData.verification_fee_paid || false,
          attempts_count: verificationData.attempts ? verificationData.attempts.length : 0,
          is_legacy_verified: user.isUserVerified || false, // Backward compatibility
          timestamp: new Date().toISOString()
        };

        // Send current status back to app
        socket.emit("verificationStatusResponse", response);
        
        console.log(`✅ Verification status sent to user ${userId}:`, response.verification_status);
        
      } catch (error) {
        console.error(`❌ Error getting verification status for user ${userId}:`, error);
        socket.emit("verificationStatusResponse", {
          error: "Failed to get verification status",
          status: "error"
        });
      }
    });

    // Typing indicator events - only frontend involvement needed
    socket.on("startTyping", async ({ conversationId, receiverId }) => {
      if (!conversationId || !receiverId) return;
      
      const typingKey = `${conversationId}_${userId.toString()}`;
      typingUsers.set(typingKey, Date.now());
      
      // Get user details for socket events
      const typingUserDetails = await getUserDetails(userId);
      const receiverDetails = await getUserDetails(receiverId);
      
      const typingData = {
        conversationId,
        userId,
        isTyping: true,
        typingUser: typingUserDetails,
        receiver: receiverDetails
      };
      
      // Notify the receiver that user is typing
      sendEventToUser(receiverId, "userTyping", typingData);
      
      // Also emit to conversation room
      socket.to(`conversation_${conversationId}`).emit("userTyping", typingData);
    });

    socket.on("stopTyping", async ({ conversationId, receiverId }) => {
      if (!conversationId || !receiverId) return;
      
      const typingKey = `${conversationId}_${userId.toString()}`;
      typingUsers.delete(typingKey);
      
      // Get user details for socket events
      const typingUserDetails = await getUserDetails(userId);
      const receiverDetails = await getUserDetails(receiverId);
      
      const typingData = {
        conversationId,
        userId,
        isTyping: false,
        typingUser: typingUserDetails,
        receiver: receiverDetails
      };
      
      // Notify the receiver that user stopped typing
      sendEventToUser(receiverId, "userTyping", typingData);
      
      // Also emit to conversation room
      socket.to(`conversation_${conversationId}`).emit("userTyping", typingData);
    });

    // Restore all previous socket functionality
    socket.on("sendToUser", ({ userId, event, data }) => {
      if (!userId || !event || data === undefined) {
        console.warn("Invalid payload for sendToUser");
        return;
      }
      sendEventToUser(userId, event, data);
    });

    socket.onAny((event, data) => {
      console.log(`Received event: ${event}, data:`, data);
      socket.emit(event, { success: true, received: data });
    });

    socket.on("isVerified", async () => {
      try {
        const user = await User.findById(userId);
        if (user) {
          sendEventToUser(userId, "isVerified", {
            _id: user._id,
            isVerified: user.isUserVerified,
            rejection_reason: user.rejection_reason
          });
        } else {
          sendEventToUser(userId, "isVerified", "User not found");
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        sendEventToUser(userId, "isVerified", error);
      }
    });

    socket.on("isBlocked", async () => {
      try {
        const user = await User.findById(userId);
        if (user) {
          sendEventToUser(userId, "isBlocked", {
            _id: user._id,
            isBlocked: user.is_blocked,
            block_reason: user.block_reason
          });
        } else {
          sendEventToUser(userId, "isBlocked", "User not found");
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        sendEventToUser(userId, "isBlocked", error);
      }
    });
    
    socket.on("getUserData", async () => {
      try {
        const user = await User.findById(userId);
        if (user) {
          sendEventToUser(userId, "getUserData", {
            _id: user._id,
            isUserVerified: user.isUserVerified,
            rejection_reason: user.rejection_reason,
            isOtpVerified: user.isOtpVerified,
            is_blocked: user.is_blocked,
          });
        } else {
          sendEventToUser(userId, "getUserData", "User not found");
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        sendEventToUser(userId, "getUserData", error);
      }
    });

    socket.on("saveEvent", async ({ key, eventData }) => {
      console.log("Received saveEvent request:", { key, eventData });
    
      if (!key || !eventData) {
        console.warn("Invalid key or eventData:", { key, eventData });
        return sendEventToUser(socket.userId, "eventError", { error: "Invalid key or data" });
      }
    
      try {
        console.log("Attempting to save or update event with key:", key);
    
        const updatedEvent = await EventStore.findOneAndUpdate(
          { key },
          { eventData },
          { upsert: true, new: true }
        );
    
        if (updatedEvent) {
          console.log("Event saved/updated successfully:", updatedEvent);
          sendEventToUser(socket.userId, "eventSaved", { success: true, key, eventData });
        } else {
          console.warn("No event was saved or updated for key:", key);
          sendEventToUser(socket.userId, "eventError", { error: "No event was saved" });
        }
      } catch (error) {
        console.error("Error saving event:", error);
        sendEventToUser(socket.userId, "eventError", { error: "Failed to save event" });
      }
    });
    

    socket.on("getEvent", async ({ key }) => {
      if (!key) {
        return sendEventToUser(socket.userId, "eventError", { error: "Key is required" });
      }

      try {
        const event = await EventStore.findOne({ key });
        if (event) {
          sendEventToUser(socket.userId, "eventData", { key, eventData: event.eventData });
        } else {
          sendEventToUser(socket.userId, "eventError", { error: "Data not found" });
        }
      } catch (error) {
        console.error("Error retrieving event:", error);
        sendEventToUser(socket.userId, "eventError", { error: "Failed to retrieve event" });
      }
    });

    socket.on("updateEvent", async ({ key, newEventData }) => {
      if (!key || !newEventData) {
        return sendEventToUser(socket.userId, "eventError", { error: "Invalid key or new data" });
      }

      try {
        const event = await EventStore.findOneAndUpdate(
          { key },
          { eventData: newEventData },
          { new: true }
        );

        if (event) {
          sendEventToUser(socket.userId, "eventUpdated", { key, newEventData });
          io.emit("eventUpdated", { key, newEventData });
        } else {
          sendEventToUser(socket.userId, "eventError", { error: "Data not found" });
        }
      } catch (error) {
        console.error("Error updating event:", error);
        sendEventToUser(socket.userId, "eventError", { error: "Failed to update event" });
      }
    });

    socket.on("disconnect", () => {
      console.log(`${userType.charAt(0).toUpperCase() + userType.slice(1)} disconnected: ${userId}`);
      
      // Automatically notify user's contacts that they are offline
      socket.broadcast.emit("userOffline", { userId, userType });
      
      // Clean up typing indicators for this user
      for (const [key, value] of typingUsers.entries()) {
        if (key.includes(`_${userId.toString()}`)) {
          typingUsers.delete(key);
        }
      }
      
      // Clean up joined conversations for this user
      joinedConversations.delete(userId.toString());
      
      connectedUsers.delete(userId.toString());
    });
  });

  // Clean up typing indicators that are older than 5 seconds
  setInterval(async () => {
    const now = Date.now();
    for (const [key, timestamp] of typingUsers.entries()) {
      if (now - timestamp > 5000) { // 5 seconds timeout
        typingUsers.delete(key);
        
        // Extract conversationId and userId from key
        const [conversationId, userId] = key.split('_');
        
        // Get user details for timeout event
        const typingUserDetails = await getUserDetails(userId);
        
        // Notify that user stopped typing (timeout)
        io.to(`conversation_${conversationId}`).emit("userTyping", {
          conversationId,
          userId,
          isTyping: false,
          typingUser: typingUserDetails,
          reason: 'timeout'
        });
      }
    }
  }, 2000); // Check every 2 seconds

  return io;
};

// Helper function to check if user has joined a conversation
const isUserJoinedToConversation = (userId, conversationId) => {
  const userIdStr = userId.toString();
  const conversationIdStr = conversationId.toString();
  return joinedConversations.has(userIdStr) && joinedConversations.get(userIdStr).has(conversationIdStr);
};

module.exports = { 
  initializeSocket, 
  sendEventToUser, 
  sendAdminUnreadCount,
  connectedUsers, 
  typingUsers, 
  joinedConversations,
  isUserJoinedToConversation,
  io 
};
