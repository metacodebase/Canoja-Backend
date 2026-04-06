const mongoose = require("mongoose");

const VALID_EVENTS = [
  "profile_view",
  "menu_view",
  "directions_tap",
  "phone_tap",
  "website_tap",
];

const analyticsEventSchema = new mongoose.Schema(
  {
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LicenseRecord",
      required: true,
    },
    event_type: {
      type: String,
      enum: VALID_EVENTS,
      required: true,
    },
  },
  {
    timestamps: true, // createdAt used as the event timestamp
  },
);

// Primary query pattern: fetch events for a business within a time window
analyticsEventSchema.index({ business_id: 1, createdAt: -1 });

module.exports = mongoose.model("AnalyticsEvent", analyticsEventSchema);
module.exports.VALID_EVENTS = VALID_EVENTS;
