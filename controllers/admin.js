const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const config = require('../config/config');
const { sendOtp } = require('../utils/send_otp');

// Admin Signup
exports.signup = async (req, res) => {
  try {
    const { name, email, password, mobile, age, location, about, profile_picture } = req.body;

    // Check if the email already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new admin
    const admin = new Admin({
      name,
      email,
      mobile,
      age,
      location,
      about,
      password: hashedPassword,
      profile_picture,
    });

    await admin.save();

    // Return success message
    res.status(201).json({ message: 'Admin account created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error in admin signup', error });
  }
};

// Admin Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find admin by email
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ adminId: admin._id }, config.JWT_SECRET);

    res.status(200).json({
      message: 'Admin login successful',
      token,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile,
        profile_picture: admin.profile_picture,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error in admin login', error });
  }
};

// Get Admin Profile
exports.getProfile = async (req, res) => {
  try {
    const adminId = req.adminId; // Retrieved from middleware

    // Find admin by ID
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.status(200).json({
      message: 'Admin profile fetched successfully',
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile,
        age: admin.age,
        location: admin.location,
        about: admin.about,
        profile_picture: admin.profile_picture,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error in getting admin profile', error });
  }
};

// Update Admin Profile
exports.updateProfile = async (req, res) => {
  try {
    const adminId = req.adminId;
    const { name, mobile, age, location, about, profile_picture } = req.body;

    // Find admin by ID and update profile
    const admin = await Admin.findByIdAndUpdate(
      adminId,
      { name, mobile, age, location, about, profile_picture },
      { new: true }
    );

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.status(200).json({
      message: 'Admin profile updated successfully',
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile,
        age: admin.age,
        location: admin.location,
        about: admin.about,
        profile_picture: admin.profile_picture,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error in updating admin profile', error });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, new_password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    admin.password = hashedPassword;
    await admin.save();

    res.status(200).json({ message: 'Admin password reset successful' });
  } catch (error) {
    res.status(500).json({ message: 'Error in resetting password', error });
  }
};


// **Send OTP for Admin Password Reset**
exports.sendOtpForPasswordReset = async (req, res) => {
    try {
      const { email } = req.body;
  
      // Check if the admin exists
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(404).json({ message: 'Admin not found' });
      }
  
      // Store OTP in the admin's document
      await sendOtp(email);
  
      // Send OTP via email
      res.status(200).json({ message: 'OTP sent successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error in sending OTP', error });
    }
  };
  
  // **Verify OTP for Password Reset**
  exports.verifyOtpForPasswordReset = async (req, res) => {
    try {
      const { email, otp } = req.body;
  
      // Find the admin by email
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(404).json({ message: 'Admin not found' });
      }
  
      // Check if OTP is valid
      if (!admin.otpDetails?.otp || admin.otpDetails?.otpExpiry < Date.now()) {
        return res.status(400).json({ message: 'Invalid or expired OTP' });
      }
  
      if (admin.otpDetails.otp !== parseInt(otp)) {
        return res.status(400).json({ message: 'Incorrect OTP' });
      }
  
      // OTP verified, clear OTP fields
      admin.otpDetails.otp = null;
      admin.otpDetails.otpExpiry = null;
      await admin.save();
  
      res.status(200).json({ message: 'OTP verified successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error in verifying OTP', error });
    }
  };
  
  // **Reset Admin Password**
  exports.updatePassword = async (req, res) => {
    try {
      const { email, newPassword } = req.body;
  
      // Find admin by email
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(404).json({ message: 'Admin not found' });
      }
  
      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
  
      // Update password
      admin.password = hashedPassword;
      await admin.save();
  
          res.status(200).json({ message: 'Admin password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error in resetting password', error });
  }
};

// Get User FCM Token (Admin can get any user's FCM token)
exports.getFCMToken = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Find the user by ID
    const User = require('../models/user'); // Import User model
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ 
      message: 'FCM token retrieved successfully', 
      fcmToken: user.fcm_token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error in retrieving FCM token', error });
  }
};

// Send Notification to User (Admin)
exports.sendNotification = async (req, res) => {
  try {
    const { title, body, userId, fcmToken, details } = req.body;
    const adminId = req.adminId; // From admin middleware

    // Import required modules
    const admin = require("../utils/firebase");
    const Notification = require("../models/notification");
    const User = require("../models/user");

    // Validate required fields
    if (!title || !body) {
      return res.status(400).json({ message: "Title and body are required" });
    }

    let targetUser;
    let targetFcmToken;

    // If userId is provided, get user's FCM token
    if (userId) {
      targetUser = await User.findById(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      targetFcmToken = targetUser.fcm_token;
      
      if (!targetFcmToken) {
        return res.status(400).json({ message: "User doesn't have FCM token" });
      }
    } 
    // If FCM token is provided directly
    else if (fcmToken) {
      targetUser = await User.findOne({ fcm_token: fcmToken });
      if (!targetUser) {
        return res.status(404).json({ message: "User with FCM token not found" });
      }
      targetFcmToken = fcmToken;
    } 
    else {
      return res.status(400).json({ message: "Either userId or fcmToken is required" });
    }

    // Construct the Firebase message
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        details: details ? JSON.stringify(details) : "{}",
        sentByAdmin: "true",
        adminId: adminId.toString()
      },
      token: targetFcmToken,
    };

    // Send the notification using Firebase Admin SDK
    const response = await admin.messaging().send(message);
    console.log("Admin notification sent successfully:", response);

    // Store the notification in the database
    const notification = new Notification({
      title,
      body,
      senderId: adminId, // Admin as sender
      receiverId: targetUser._id,
      fcmToken: targetFcmToken,
      details: {
        ...details,
        sentByAdmin: true
      }
    });

    await notification.save();

    res.status(200).json({ 
      message: "Notification sent successfully",
      recipient: {
        userId: targetUser._id,
        name: targetUser.name,
        email: targetUser.email
      },
      notification: {
        title,
        body,
        details
      }
    });
  } catch (error) {
    console.error("Error sending admin notification:", error);
    res.status(500).json({ 
      message: "Error sending notification", 
      error: error.message 
    });
  }
};

// Send Bulk Notifications (Admin)
exports.sendBulkNotification = async (req, res) => {
  try {
    const { title, body, userIds, details } = req.body;
    const adminId = req.adminId;

    // Import required modules
    const admin = require("../utils/firebase");
    const Notification = require("../models/notification");
    const User = require("../models/user");

    // Validate required fields
    if (!title || !body) {
      return res.status(400).json({ message: "Title and body are required" });
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "User IDs array is required" });
    }

    // Get users with valid FCM tokens
    const users = await User.find({ 
      _id: { $in: userIds },
      fcm_token: { $ne: "", $exists: true }
    }).select('_id name email fcm_token');

    if (users.length === 0) {
      return res.status(404).json({ message: "No users found with valid FCM tokens" });
    }

    const results = {
      successful: [],
      failed: []
    };

    // Send notifications to each user
    for (const user of users) {
      try {
        // Construct the Firebase message
        const message = {
          notification: {
            title: title,
            body: body,
          },
          data: {
            details: details ? JSON.stringify(details) : "{}",
            sentByAdmin: "true",
            adminId: adminId.toString(),
            isBulkMessage: "true"
          },
          token: user.fcm_token,
        };

        // Send the notification
        const response = await admin.messaging().send(message);
        
        // Store in database
        const notification = new Notification({
          title,
          body,
          senderId: adminId,
          receiverId: user._id,
          fcmToken: user.fcm_token,
          details: {
            ...details,
            sentByAdmin: true,
            isBulkMessage: true
          }
        });

        await notification.save();

        results.successful.push({
          userId: user._id,
          name: user.name,
          email: user.email,
          messageId: response
        });

      } catch (error) {
        console.error(`Failed to send notification to user ${user._id}:`, error);
        results.failed.push({
          userId: user._id,
          name: user.name,
          email: user.email,
          error: error.message
        });
      }
    }

    res.status(200).json({
      message: "Bulk notification process completed",
      summary: {
        requested: userIds.length,
        found: users.length,
        successful: results.successful.length,
        failed: results.failed.length
      },
      results
    });

  } catch (error) {
    console.error("Error sending bulk notifications:", error);
    res.status(500).json({ 
      message: "Error sending bulk notifications", 
      error: error.message 
    });
  }
};