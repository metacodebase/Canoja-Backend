const mongoose = require("mongoose");

const passwordResetOTPSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Auto-delete expired OTPs
    },
    used: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Index for faster lookups
passwordResetOTPSchema.index({ email: 1, used: 1 });

module.exports = mongoose.model("PasswordResetOTP", passwordResetOTPSchema);
