const mongoose = require('mongoose');

/**
 * Report Model - For Apple App Store Guideline 1.2 Compliance
 * Tracks user reports of equipment or other users for objectionable content
 */
const reportSchema = new mongoose.Schema({
  reporter: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  reported_user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  equipment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Equipment',
    default: null
  },
  reason: { 
    type: String, 
    required: true,
    enum: [
      'inappropriate_content',
      'harassment',
      'spam',
      'fraud',
      'offensive_language',
      'other'
    ]
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  type: { 
    type: String, 
    enum: ['equipment', 'user'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'reviewed', 'resolved', 'dismissed'], 
    default: 'pending',
    index: true
  },
  admin_notes: {
    type: String,
    default: ''
  },
  reviewed_at: {
    type: Date,
    default: null
  },
  reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  }
}, { 
  timestamps: true 
});

// Compound index for checking duplicate reports
reportSchema.index({ reporter: 1, reported_user: 1, equipment: 1 });

module.exports = mongoose.models.Report || mongoose.model('Report', reportSchema);

