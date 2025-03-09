const mongoose = require("mongoose");

const EventStoreSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    eventData: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EventStore", EventStoreSchema);
