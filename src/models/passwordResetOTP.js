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
    // For email change flow
    purpose: {
      type: String,
      enum: ["password_reset", "email_change"],
      default: "password_reset",
    },
    new_email: {
      type: String,
      default: null,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Index for faster lookups
passwordResetOTPSchema.index({ email: 1, used: 1 });

module.exports = mongoose.model("PasswordResetOTP", passwordResetOTPSchema);
