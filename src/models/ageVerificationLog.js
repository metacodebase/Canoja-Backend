const mongoose = require("mongoose");

const ageVerificationLogSchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      required: true,
      index: true,
    },
    confirmed_age: {
      type: Boolean,
      required: true,
    },
    min_age: {
      type: Number,
      default: 21,
    },
    platform: {
      type: String,
      enum: ["ios", "android"],
    },
    device_id: {
      type: String,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("AgeVerificationLog", ageVerificationLogSchema);
