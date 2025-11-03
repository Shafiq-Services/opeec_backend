const AdminNotification = require('../models/adminNotification');
const { sendEventToUser } = require('../utils/socketService');
const { sendAdminNotificationEmail } = require('../utils/emailService');
const Admin = require('../models/admin');

// Notification type configurations
const NOTIFICATION_CONFIGS = {
  user_registration: {
    color: '#3B82F6', // Blue
    icon: 'user-plus',
    title: 'New User Registration'
  },
  user_verification_request: {
    color: '#F59E0B', // Orange
    icon: 'user-check',
    title: 'User Verification Request'
  },
  user_appeal_request: {
    color: '#EF4444', // Red
    icon: 'user-x',
    title: 'User Appeal Request'
  },
  equipment_submission: {
    color: '#10B981', // Green
    icon: 'package-plus',
    title: 'New Equipment Submission'
  },
  equipment_resubmission: {
    color: '#8B5CF6', // Purple
    icon: 'package-check',
    title: 'Equipment Resubmission'
  },
  rental_booking: {
    color: '#059669', // Emerald
    icon: 'calendar-check',
    title: 'New Rental Booking'
  },
  late_return_alert: {
    color: '#DC2626', // Dark Red
    icon: 'clock-alert',
    title: 'Late Return Alert'
  },
  penalty_dispute: {
    color: '#F97316', // Orange
    icon: 'alert-triangle',
    title: 'Penalty Dispute'
  }
};

// Helper function to create and send admin notification
const createAdminNotification = async (type, body, relatedData = {}) => {
  try {
    const config = NOTIFICATION_CONFIGS[type];
    if (!config) {
      console.error(`Unknown notification type: ${type}`);
      return;
    }

    // Create notification in database
    const notification = new AdminNotification({
      title: config.title,
      body,
      type,
      color: config.color,
      icon: config.icon,
      relatedUserId: relatedData.userId || null,
      relatedEquipmentId: relatedData.equipmentId || null,
      relatedOrderId: relatedData.orderId || null,
      data: relatedData.data || {}
    });

    await notification.save();

    // Get unread count
    const unreadCount = await AdminNotification.countDocuments({ isRead: false });

    // Prepare socket event data
    const socketData = {
      _id: notification._id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      color: notification.color,
      icon: notification.icon,
      relatedUserId: notification.relatedUserId,
      relatedEquipmentId: notification.relatedEquipmentId,
      relatedOrderId: notification.relatedOrderId,
      data: notification.data,
      createdAt: notification.createdAt,
      unreadCount
    };

    // Send socket event to admin (assuming admin has a fixed ID or we broadcast to admin room)
    // For now, I'll create a function to broadcast to all admins
    await broadcastToAllAdmins('adminNotification', socketData);

    // Send email notifications to all admins
    await sendEmailToAllAdmins(notification);

    console.log(`✅ Admin notification created: ${type} - ${body}`);
    return notification;

  } catch (error) {
    console.error('❌ Error creating admin notification:', error);
    throw error;
  }
};

// Helper function to broadcast to all admins (you can modify this based on your admin management)
const broadcastToAllAdmins = async (event, data) => {
  // Since we don't have a specific way to get all admin IDs from the socket service,
  // we'll use a special admin room. You might need to modify this based on your socket implementation
  const admins = await Admin.find({}).select('_id');
  
  // Send to each admin individually
  admins.forEach(admin => {
    sendEventToUser(admin._id.toString(), event, data);
  });
};

// Helper function to send email notifications to all admins
const sendEmailToAllAdmins = async (notification) => {
  try {
    // Get all admin emails from database
    const admins = await Admin.find({}).select('email name');
    
    if (admins.length === 0) {
      console.log('⚠️  No admins found for email notifications');
      return;
    }

    console.log(`📧 Sending email notifications to ${admins.length} admin(s)`);
    
    // Send email to each admin
    const emailPromises = admins.map(async (admin) => {
      try {
        await sendAdminNotificationEmail(admin.email, {
          type: notification.type,
          title: notification.title,
          body: notification.body,
          data: notification.data
        });
        console.log(`✅ Email sent to admin: ${admin.email}`);
      } catch (error) {
        console.error(`❌ Failed to send email to admin ${admin.email}:`, error.message);
      }
    });

    // Wait for all emails to be sent (or fail)
    await Promise.allSettled(emailPromises);
    
  } catch (error) {
    console.error('❌ Error sending admin notification emails:', error);
  }
};

// Get admin notifications with pagination
exports.getAdminNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Get notifications
    const notifications = await AdminNotification.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('relatedUserId', 'name email profile_image')
      .populate('relatedEquipmentId', 'name images')
      .populate('relatedOrderId', 'rental_status rental_schedule')
      .lean();

    // Get total count
    const totalNotifications = await AdminNotification.countDocuments();
    const unreadCount = await AdminNotification.countDocuments({ isRead: false });

    // Mark all notifications as read
    await AdminNotification.updateMany(
      { isRead: false }, 
      { 
        isRead: true, 
        readAt: new Date() 
      }
    );

    // Send updated unread count to admin
    await broadcastToAllAdmins('adminNotificationUnreadCount', { unreadCount: 0 });

    // Format response
    const formattedNotifications = notifications.map(notification => ({
      _id: notification._id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      color: notification.color,
      icon: notification.icon,
      relatedUser: notification.relatedUserId,
      relatedEquipment: notification.relatedEquipmentId,
      relatedOrder: notification.relatedOrderId,
      data: notification.data,
      isRead: true, // All are marked as read now
      createdAt: notification.createdAt
    }));

    res.status(200).json({
      message: 'Admin notifications retrieved successfully',
      status: true,
      notifications: formattedNotifications,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalNotifications / limit),
        totalNotifications,
        unreadCount: 0 // Reset to 0 after marking all as read
      }
    });

  } catch (error) {
    console.error('Error fetching admin notifications:', error);
    res.status(500).json({
      message: 'Error fetching admin notifications',
      status: false,
      error: error.message
    });
  }
};



// Export the helper function for use in other controllers
module.exports = {
  getAdminNotifications: exports.getAdminNotifications,
  createAdminNotification
};
