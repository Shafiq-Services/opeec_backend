const mongoose = require('mongoose');

// Admin Notification Schema
const adminNotificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  type: { 
    type: String, 
    required: true,
    enum: [
      'user_registration',
      'user_verification_request', 
      'user_appeal_request',
      'equipment_submission',
      'equipment_resubmission',
      'rental_booking',
      'late_return_alert',
      'penalty_dispute'
    ]
  },
  color: { type: String, required: true }, // Hex color code
  icon: { type: String, required: true }, // Icon name/identifier
  relatedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  relatedEquipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' },
  relatedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }, // Additional data
  isRead: { type: Boolean, default: false },
  readAt: { type: Date }
}, { 
  timestamps: true
});

// Index for efficient querying
adminNotificationSchema.index({ isRead: 1, createdAt: -1 });

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);
