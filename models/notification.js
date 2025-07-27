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

module.exports = mongoose.model('Notification', notificationSchema);
