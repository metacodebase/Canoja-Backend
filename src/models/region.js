const mongoose = require("mongoose");

const regionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: ["Colorado", "Michigan", "Canada", "Jamaica", "US Virgin Islands"],
    },
    code: {
      type: String,
      required: true,
      unique: true,
      enum: ["CO", "MI", "CA", "JM", "VI"],
    },
    country: {
      type: String,
      required: true,
    },
    boundaries: {
      north: { type: Number, required: true }, // Maximum latitude
      south: { type: Number, required: true }, // Minimum latitude
      east: { type: Number, required: true }, // Maximum longitude
      west: { type: Number, required: true }, // Minimum longitude
    },
    center: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    timezone: { type: String },
    currency: { type: String },
    isActive: { type: Boolean, default: true },
    description: { type: String },

    // Additional metadata for region management
    population: { type: Number },
    area_km2: { type: Number },
    languages: [{ type: String }],

    // Shop collection reference
    shopCollection: {
      type: String,
      required: true,
      enum: ["All_Shops"],
    },

    // Default search radius in kilometers
    defaultSearchRadius: { type: Number, default: 50 },

    // Maximum search radius allowed for this region
    maxSearchRadius: { type: Number, default: 100 },
  },
  {
    collection: "Regions",
    timestamps: true,
  },
);

// Index for efficient geographical queries
regionSchema.index({
  "boundaries.north": 1,
  "boundaries.south": 1,
  "boundaries.east": 1,
  "boundaries.west": 1,
});

// Method to check if a coordinate is within this region's boundaries
regionSchema.methods.containsCoordinate = function (lat, lng) {
  return (
    lat >= this.boundaries.south &&
    lat <= this.boundaries.north &&
    lng >= this.boundaries.west &&
    lng <= this.boundaries.east
  );
};

// Static method to find region by coordinates
regionSchema.statics.findByCoordinates = function (lat, lng) {
  return this.findOne({
    isActive: true,
    "boundaries.south": { $lte: lat },
    "boundaries.north": { $gte: lat },
    "boundaries.west": { $lte: lng },
    "boundaries.east": { $gte: lng },
  });
};

module.exports = mongoose.model("Region", regionSchema);
