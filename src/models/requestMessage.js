const mongoose = require("mongoose");

const requestMessageSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VerificationRequest",
      required: true,
      index: true,
    },
    body: { type: String, required: true },
    fromAdmin: { type: Boolean, default: true },
    senderName: { type: String, default: "Admin" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("RequestMessage", requestMessageSchema);
