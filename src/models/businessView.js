const mongoose = require("mongoose");

const businessViewSchema = new mongoose.Schema(
  {
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LicenseRecord",
      required: true,
    },
    device_id: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Unique compound index — one view per device per business, forever
businessViewSchema.index({ business_id: 1, device_id: 1 }, { unique: true });

module.exports = mongoose.model("BusinessView", businessViewSchema);
