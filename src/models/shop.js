const mongoose = require("mongoose");

const matchedLicenseSchema = new mongoose.Schema(
  {
    business_name: String,
    license_number: String,
    license_status: String,
    license_type: String,
    address: String,
    city: String,
    stateName: String,
    dba: String,
  },
  { _id: false },
);

const shopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String },
    city: { type: String }, // Parsed city from address
    state: { type: String }, // Parsed state abbreviation from address
    stateName: { type: String }, // Parsed full state name from address
    lat: { type: Number },
    lng: { type: Number },
    place_id: { type: String, index: true, unique: true },
    rating: { type: Number },
    user_ratings_total: { type: Number },
    price_level: { type: Number },
    types: [{ type: String }],
    business_status: { type: String },
    open_now: { type: Boolean },
    opening_hours: { type: mongoose.Schema.Types.Mixed },
    photo_url: { type: String },
    photos: { type: [mongoose.Schema.Types.Mixed] },
    license_status: { type: String },
    isMatched: { type: Boolean },
    matchedLicense: { type: matchedLicenseSchema },
    smoke_shop: { type: Boolean },

    // persistence metadata
    source: {
      type: String,
      enum: ["compare-shops", "compare-shops/more", "compare-shops-text"],
      required: true,
    },
    session_key: { type: String },
    current_query: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    radius: { type: Number },
    fetched_at: { type: Date, default: Date.now },
  },
  {
    collection: "All_Shops",
    timestamps: true,
  },
);

module.exports = mongoose.model("Shop", shopSchema);
