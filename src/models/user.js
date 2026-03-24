const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["consumer", "operator", "admin"],
      default: "consumer",
    },
    licenseRecords: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LicenseRecord",
      },
    ],
    requiresPasswordChange: {
      type: Boolean,
      default: false,
    },
    refreshToken: {
      type: String,
      default: null,
      index: true,
    },
    refreshTokenExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
