const admin = require("../utils/firebase");
const Notification = require("../models/notification");
const User = require("../models/user"); // User model to fetch sender details

// Send Notification API
async function sendNotification(req, res) {
  const { title, body, fcmToken, details } = req.body;
  const senderId = req.userId;

  try {
    // Validate body
    if (typeof body !== "string") {
      return res.status(400).json({ message: "Body must be a valid string" });
    }

    // Validate fcmToken - reject empty so we don't look up wrong user or send invalid push
    if (!fcmToken || typeof fcmToken !== "string" || fcmToken.trim() === "") {
      return res.status(400).json({ message: "FCM token is required and must be non-empty" });
    }

    const user = await User.findOne({ fcm_token: fcmToken });
    if (!user) {
      return res.status(404).json({ message: "FCM token not found for any user" });
    }

    const receiverId = user._id;

    // Firebase data payload values must be strings
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        details: details ? JSON.stringify(details) : "{}",
      },
      token: fcmToken,
    };

    // Send the notification using Firebase Admin SDK
    try {
      const response = await admin.messaging().send(message);
      console.log("Successfully sent message:", response);
    } catch (firebaseError) {
      const code = firebaseError.code || firebaseError.errorInfo?.code || "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        console.warn(`Stale FCM token for user ${receiverId}, clearing it.`);
        await User.findByIdAndUpdate(receiverId, { fcm_token: "" });
        return res.status(410).json({ message: "FCM token was stale and has been cleared" });
      }
      throw firebaseError;
    }

    // Store the notification in the database
    const notification = new Notification({
      title,
      body,
      senderId,
      receiverId,
      fcmToken,
      details,
    });

    await notification.save();

    res.status(200).json({ message: "Notification sent successfully" });
  } catch (error) {
    console.error("Error sending notification:", error);
    res
      .status(500)
      .json({ message: "Error sending notification", error: error.message });
  }
}

// Get Notifications API
async function getNotifications(req, res) {
  const receiverId = req.userId; // Get receiverId from token

  try {
    // Fetch notifications for the receiver, including senderId for internal use
    const notifications = await Notification.find({ receiverId })
      .sort({ createdAt: -1 })
      .select("-fcmToken -receiverId -__v") // Keep createdAt/updatedAt for sorting and response
      .lean();

    // Add sender details to notifications
    const notificationsWithSender = await Promise.all(
      notifications.map(async (notification) => {
        const sender = await User.findById(notification.senderId)
          .select("id name picture")
          .lean();
        const { senderId, ...rest } = notification; // Exclude senderId from the final response
        return {
          ...rest,
          receivedAt: rest.updatedAt, // Explicit field for app notification history
          sender: sender || null, // Add sender details or null if not found
        };
      })
    );

    res.status(200).json(notificationsWithSender);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res
      .status(500)
      .json({ message: "Error fetching notifications", error: error.message });
  }
}

/**
 * Send push notification and save to DB for in-app list. Used by backend (e.g. on order booked).
 * Does not throw; logs errors so callers are not blocked.
 * @param {Object} options
 * @param {string} options.receiverId - User._id of recipient
 * @param {string} options.senderId - User._id of sender (for in-app display)
 * @param {string} options.title
 * @param {string} options.body
 * @param {object} [options.details] - Optional payload for data.details (will be JSON.stringified)
 */
async function sendNotificationToUser({ receiverId, senderId, title, body, details }) {
  try {
    const receiver = await User.findById(receiverId).select("fcm_token").lean();
    if (!receiver || !receiver.fcm_token || String(receiver.fcm_token).trim() === "") {
      return;
    }
    const fcmToken = receiver.fcm_token;
    const message = {
      notification: { title, body },
      data: { details: details ? JSON.stringify(details) : "{}" },
      token: fcmToken,
    };

    try {
      await admin.messaging().send(message);
    } catch (firebaseError) {
      const code = firebaseError.code || firebaseError.errorInfo?.code || "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        console.warn(`Stale FCM token for user ${receiverId}, clearing it.`);
        await User.findByIdAndUpdate(receiverId, { fcm_token: "" });
      }
      throw firebaseError;
    }

    const notification = new Notification({
      title,
      body,
      senderId,
      receiverId,
      fcmToken,
      details: details || null,
    });
    await notification.save();
  } catch (error) {
    console.error("sendNotificationToUser error:", error.message);
  }
}

module.exports = {
  sendNotification,
  getNotifications,
  sendNotificationToUser,
};
