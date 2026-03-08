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
      'equipment_updated',
      'rental_booking',
      'late_return_alert',
      'penalty_dispute',
      'content_report',
      'user_blocked_by_user',
      'payment_failed',
      'order_refund_processed',
      'refund_failed',
      'order_creation_failed',
      'order_created_via_webhook',
      'late_penalty_manual_collection',
      'late_penalty_charged',
      'late_penalty_payment_failed',
      'withdrawal_approved',
      'withdrawal_rejected',
      'STRIPE_CONNECT_ORPHANED',
      'STRIPE_CONNECT_ACCOUNT_CREATED',
      'STRIPE_CONNECT_ONBOARDING_COMPLETED',
      'STRIPE_CONNECT_ACCOUNT_DEAUTHORIZED',
      'STRIPE_CONNECT_ACCOUNT_DISABLED',
      'STRIPE_TRANSFER_INITIATED',
      'STRIPE_TRANSFER_COMPLETED',
      'STRIPE_TRANSFER_FAILED',
      'STRIPE_TRANSFER_REVERSED',
      'STRIPE_PAYOUT_TO_BANK_COMPLETED',
      'STRIPE_PAYOUT_TO_BANK_FAILED',
      'STRIPE_VERIFICATION_ORPHANED'
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
