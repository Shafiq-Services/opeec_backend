const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    title: { type: String, required: true },
    body: { type: String, required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fcmToken: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: null }
}, { 
    timestamps: true // Replaces createdAt with automatic timestamps
});

// Indexes for fast queries on notification list and cleanup
notificationSchema.index({ receiverId: 1, createdAt: -1 });
notificationSchema.index({ senderId: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
