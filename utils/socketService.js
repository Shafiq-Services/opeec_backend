const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Admin = require("../models/admin");
const EventStore = require("../models/EventStore");

const JWT_SECRET = process.env.JWT_SECRET || "Opeec";
// Map<userId, Set<socketId>> - user is online if they have at least one socket
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
  const userIdStr = userId.toString();
  const room = `user_${userIdStr}`;
  const socketIds = connectedUsers.get(userIdStr);
  if (socketIds && socketIds.size > 0) {
    io.to(room).emit(event, data);
    console.log(`Event "${event}" sent to user ${userId} (${socketIds.size} socket(s)):`, data);
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
    const userIdStr = userId.toString();
    if (!connectedUsers.has(userIdStr)) {
      connectedUsers.set(userIdStr, new Set());
    }
    connectedUsers.get(userIdStr).add(socket.id);
    socket.join(`user_${userIdStr}`);
    console.log(`${userType.charAt(0).toUpperCase() + userType.slice(1)} connected: ${userId}, Socket ID: ${socket.id} (total sockets for user: ${connectedUsers.get(userIdStr).size})`);

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

    // ---------------------- STRIPE CONNECT STATUS REQUEST ----------------------
    
    /**
     * Handle Stripe Connect status request from app
     * App can emit 'requestStripeConnectStatus' to get status + admin settings
     */
    socket.on("requestStripeConnectStatus", async () => {
      try {
        console.log(`💳 User ${userId} requested Stripe Connect status via socket`);
        
        const User = require("../models/user");
        const AppSettings = require("../models/appSettings");
        
        // Get user's Stripe Connect status
        const user = await User.findById(userId).select('stripe_connect');
        if (!user) {
          socket.emit("stripeConnectStatusResponse", {
            error: "User not found",
            status: "error"
          });
          return;
        }

        // Get admin settings for title and description
        const settings = await AppSettings.findOne();
        
        // Prepare response: include account_status so Flutter sidebar stays in sync with create-intent checks
        const accountStatus = user.stripe_connect?.account_status || 'not_connected';
        const response = {
          status: accountStatus,
          account_status: accountStatus, // Flutter expects this key
          title: settings?.stripe_connect_title || 'Connect Your Bank Account',
          description: settings?.stripe_connect_description || 'Connect your bank account to receive automatic payouts after each rental.'
        };

        // Send response back to app
        socket.emit("stripeConnectStatusResponse", response);
        
        console.log(`✅ Stripe Connect status sent to user ${userId}:`, accountStatus);
        
      } catch (error) {
        console.error(`❌ Error getting Stripe Connect status for user ${userId}:`, error);
        socket.emit("stripeConnectStatusResponse", {
          error: "Failed to get Stripe Connect status",
          status: "error"
        });
      }
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

        // Send current status back to app (both events for compatibility)
        socket.emit("verificationStatusResponse", response);
        
        // ALSO emit legacy event name for existing mobile app compatibility
        socket.emit("isVerified", {
          _id: userId,
          isVerified: response.verification_status === 'verified',
          verification_status: response.verification_status,
          rejection_reason: response.verification_status === 'failed' ? 'Verification failed' : ''
        });
        
        console.log(`✅ Verification status sent to user ${userId}:`, response.verification_status);
        
      } catch (error) {
        console.error(`❌ Error getting verification status for user ${userId}:`, error);
        socket.emit("verificationStatusResponse", {
          error: "Failed to get verification status",
          status: "error"
        });
      }
    });

    // Unified typing event - replaces startTyping/stopTyping
    socket.on("typing", async ({ conversationId, receiverId, isTyping }) => {
      if (!conversationId || !receiverId) return;
      
      const typingKey = `${conversationId}_${userId.toString()}`;
      
      if (isTyping) {
        typingUsers.set(typingKey, Date.now());
      } else {
        typingUsers.delete(typingKey);
      }
      
      // Standardized typing payload
      const typingData = {
        conversationId,
        userId: userId.toString(),
        isTyping: !!isTyping
      };
      
      // Notify the receiver
      sendEventToUser(receiverId, "typing", typingData);
      
      // Also emit to conversation room
      socket.to(`conversation_${conversationId}`).emit("typing", typingData);
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
      console.log(`${userType.charAt(0).toUpperCase() + userType.slice(1)} disconnected: ${userId}, Socket ID: ${socket.id}`);
      
      // Automatically notify user's contacts that they are offline
      socket.broadcast.emit("userOffline", { userId, userType });
      
      // Clean up typing indicators for this user
      const uidStr = userId.toString();
      for (const [key, value] of typingUsers.entries()) {
        if (key.includes(`_${uidStr}`)) {
          typingUsers.delete(key);
        }
      }
      
      // Clean up joined conversations for this user
      joinedConversations.delete(uidStr);
      
      // Remove this socket from user's set; user is offline only when no sockets left
      const socketSet = connectedUsers.get(uidStr);
      if (socketSet) {
        socketSet.delete(socket.id);
        if (socketSet.size === 0) {
          connectedUsers.delete(uidStr);
        }
      }
    });
  });

  // Clean up typing indicators that are older than 5 seconds
  setInterval(async () => {
    try {
      const now = Date.now();
      for (const [key, timestamp] of typingUsers.entries()) {
        if (now - timestamp > 5000) { // 5 seconds timeout
          typingUsers.delete(key);
          
          // Extract conversationId and userId from key
          const [conversationId, typingUserId] = key.split('_');
          
          // Notify that user stopped typing (timeout) - standardized payload
          io.to(`conversation_${conversationId}`).emit("typing", {
            conversationId,
            userId: typingUserId,
            isTyping: false
          });
        }
      }
    } catch (error) {
      console.error('Error in typing cleanup interval:', error);
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
