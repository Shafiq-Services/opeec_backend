const admin = require("../utils/firebase");
const Notification = require("../models/notification");
const User = require("../models/user"); // User model to fetch sender details

// Send Notification API
async function sendNotification(req, res) {
  const { title, body, fcmToken, details } = req.body;
  const senderId = req.userId;

  const user = await User.findOne({ fcm_token: fcmToken});

  if (!user) {
    return res.status(404).json({ message: "FCM Token not found" });
  }

  const receiverId = user._id;

  try {
    // Validate body
    if (typeof body !== "string") {
      return res.status(400).json({ message: "Body must be a valid string" });
    }

    // Validate fcmToken
    if (!fcmToken) {
      return res.status(400).json({ message: "FCM token is required" });
    }

    // Construct the message object
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        details: details ? JSON.stringify(details) : {},
      },
      token: fcmToken,
    };

    // Send the notification using Firebase Admin SDK
    const response = await admin.messaging().send(message);
    console.log("Successfully sent message:", response);

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
      .select("-fcmToken -receiverId -__v -createdAt") // Exclude unwanted fields, keep senderId for processing
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

module.exports = {
  sendNotification,
  getNotifications,
};
