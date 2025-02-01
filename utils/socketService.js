const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const JWT_SECRET = process.env.JWT_SECRET || "Opeec";
const connectedUsers = new Map();

let io;

const sendEventToUser = (userId, event, data) => {
  console.log("Connected Users:", connectedUsers);
  const socketId = connectedUsers.get(String(userId));
  if (socketId) {
    io.to(socketId).emit(event, data);
    console.log(`Event "${event}" sent to user ${userId}:`, data);
  } else {
    console.warn(`User with ID ${userId} is not connected.`);
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
    const token = socket.handshake.auth.token;
    if (!token) {
      console.error("Socket connection denied: Token missing");
      return next(new Error("Token missing"));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      console.log(`Socket authenticated for user: ${decoded.userId}`);
      next();
    } catch (error) {
      console.error("Socket connection denied: Invalid or expired token", error);
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    connectedUsers.set(userId, socket.id);
    console.log(`User connected: ${userId}, Socket ID: ${socket.id}`);

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
    
    socket.on("isVerified", async () => {
      try {
        const user = await User.findById(userId);
        if (user) {
          sendEventToUser(userId, "isVerified", {
            _id: user._id,
            isUserVerified: user.isUserVerified,
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

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${userId}`);
      connectedUsers.delete(userId);
    });
  });

  return io;
};

module.exports = { initializeSocket, sendEventToUser, io };
