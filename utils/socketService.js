const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Redis = require("ioredis");

const JWT_SECRET = process.env.JWT_SECRET || "Opeec";
const connectedUsers = new Map();
const redis = new Redis({
  host: "opeec.redis.cache.windows.net", // Azure Redis Cache hostname
  port: 6380, // Use SSL port (6380)
  password: "4aEfpKy1SEO1VINcik6cakXHZFpBjhli8AzCaAw7494=", // Redis Access Key
  tls: { rejectUnauthorized: false }, // Required for Azure Redis SSL connections
  enableReadyCheck: false, // Helps avoid connection issues
  lazyConnect: false, // Ensures immediate connection
});

redis.ping()
  .then((result) => console.log("Redis Connected:", result))
  .catch((err) => console.error("Redis Connection Error:", err));

let io;

// Helper functions to interact with Redis
const setEventData = async (key, data) => {
  await redis.set(key, JSON.stringify(data));
};

const getEventData = async (key) => {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
};

const sendEventToUser = (userId, event, data) => {
  console.log("Connected Users:", connectedUsers);
  const socketId = connectedUsers.get(String(userId));
  if (socketId) {
    io.to(socketId).emit(event, data);
    console.log(`📢 Event "${event}" sent to user ${userId}:`, data);
  } else {
    console.warn(`⚠️ User with ID ${userId} is not connected.`);
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

  console.log("🚀 Socket server initialized...");

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      console.error("❌ Socket connection denied: Token missing");
      return next(new Error("Token missing"));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      console.log(`🔓 Socket authenticated for user: ${decoded.userId}`);
      next();
    } catch (error) {
      console.error("❌ Socket connection denied: Invalid token", error);
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    connectedUsers.set(userId, socket.id);
    console.log(`✅ User connected: ${userId}, Socket ID: ${socket.id}`);

    socket.on("sendToUser", ({ userId, event, data }) => {
      if (!userId || !event || data === undefined) {
        console.warn("⚠️ Invalid payload for sendToUser");
        return;
      }
      sendEventToUser(userId, event, data);
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
        console.error("❌ Error fetching user data:", error);
        sendEventToUser(userId, "getUserData", error);
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${userId}`);
      connectedUsers.delete(userId);
    });

    // ✅ Save Data in Redis
    socket.on("saveEvent", async ({ key, eventData }) => {
      if (!key || !eventData) {
        return sendEventToUser(socket.userId, "eventError", { error: "Invalid key or data" });
      }
      console.log(`🗄️ Saving event data in Redis for key: ${key}`);
      await setEventData(key, eventData);
      console.log(`✅ Data saved in Redis for key: ${key}`);
      sendEventToUser(socket.userId, "eventSaved", { success: true, key, eventData });
    });

    // ✅ Retrieve Data from Redis
    socket.on("getEvent", async ({ key }) => {
      if (!key) {
        return sendEventToUser(socket.userId, "eventError", { error: "Key is required" });
      }
      console.log(`🔍 Fetching data from Redis for key: ${key}`);
      const eventData = await getEventData(key);
      console.log(`📦 Retrieved data:`, eventData);

      if (eventData) {
        sendEventToUser(socket.userId, "eventData", { key, eventData });
      } else {
        console.warn(`⚠️ No data found for key: ${key}`);
        sendEventToUser(socket.userId, "eventError", { error: "Data not found" });
      }
    });

    // ✅ Update Data in Redis
    socket.on("updateEvent", async ({ key, newEventData }) => {
      if (!key || !newEventData) {
        return sendEventToUser(socket.userId, "eventError", { error: "Invalid key or new data" });
      }

      console.log(`🔄 Updating event in Redis for key: ${key}`);
      const existingData = await getEventData(key);

      if (existingData) {
        const updatedData = { ...existingData, ...newEventData };
        await setEventData(key, updatedData);
        console.log(`✅ Event updated:`, updatedData);

        sendEventToUser(socket.userId, "eventUpdated", { key, updatedData });
        io.emit("eventUpdated", { key, updatedData }); // Notify all users
      } else {
        console.warn(`⚠️ No existing data for key: ${key}`);
        sendEventToUser(socket.userId, "eventError", { error: "Data not found" });
      }
    });
  });

  return io;
};

module.exports = { initializeSocket, sendEventToUser };
