const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    equipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Equipment",
      required: false,
    },
    isResolved: {
      type: Boolean,
      default: false,
    },
    resolvedAt: {
      type: Date,
      required: false,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: false,
    }
  },
  {
    timestamps: true, // Already using timestamps correctly
  }
);

module.exports = mongoose.model("Conversation", conversationSchema);
