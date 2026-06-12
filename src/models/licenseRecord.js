const mongoose = require("mongoose");
const { castFlexibleDate } = require("../utils/parseDate");

const FLEXIBLE_DATE_FIELDS = [
  "issue_date",
  "expiration_date",
  "claimedAt",
  "menuUploadedAt",
  "lastVerifiedDate",
];

const licenseRecordSchema = new mongoose.Schema(
  {
    // Google Maps Identifiers
    googlePlaceId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    place_id: String,
    google_id: String,
    cid: String,
    kgmid: String,
    reviews_id: String,

    // Basic Business Information
    business_name: String,
    license_number: { type: String, index: true },
    type: String, // Main type from Google Maps
    subtypes: [String], // All subtypes
    category: String, // Main category

    // Location Information
    stateName: { type: String, index: true },
    city: { type: String, index: true },
    business_address: String,
    street: String,
    borough: String,
    postal_code: String,
    country: String,
    country_code: String,
    time_zone: String,
    plus_code: String,

    // Contact Information
    contact_information: {
      phone: String,
      email: String,
      website: String,
      domain: String,
    },
    email_1: String,
    email_2: String,

    // Location Data
    location: {
      type: {
        type: String,
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
    },
    latitude: Number,
    longitude: Number,

    // Parent Location
    located_in: String, // Name of parent place
    located_google_id: String, // Google ID of parent place

    // Reviews & Ratings
    rating: Number,
    reviews: Number,
    reviews_link: String,
    reviews_per_score: mongoose.Schema.Types.Mixed, // JSON object
    reviews_tags: [String],

    // Photos
    photos_count: Number,
    photo: String, // Main photo URL
    street_view: String, // Street view image URL

    // Business Hours & Status
    working_hours: mongoose.Schema.Types.Mixed, // JSON object
    working_hours_csv_compat: String,
    popular_times: mongoose.Schema.Types.Mixed, // JSON object
    business_status: String,

    // Business Details
    about: String, // Extra info (women-owned, LGBTQ+ friendly, etc.)
    range: String, // Price range
    description: String, // Place description
    posts: mongoose.Schema.Types.Mixed, // Posts from the place
    verified: { type: Boolean, default: false },
    area_service: { type: Boolean, default: false }, // Service without physical location

    // Links
    location_link: String, // Link to place on Google Maps
    reservation_links: String,
    booking_appointment_link: String,
    menu_link: String,
    order_links: String,

    // Owner Information (Google Maps)
    owner_id: String,
    owner_title: String,
    owner_link: String,

    // License Owner Information (Your Data)
    owner: {
      name: String,
      email: String,
      role: String,
      phone: String,
      govt_issued_id: String,
    },
    operator_name: String,

    // License Information
    issue_date: Date,
    expiration_date: Date,
    license_type: { type: String, index: true },
    license_status: { type: String, index: true },
    jurisdiction: String,
    regulatory_body: String,
    entity_type: [String],
    filing_documents_url: String,
    license_conditions: [String],

    // Claim Information
    claimed: { type: Boolean, default: false, index: true },
    claimedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },

    // Verification
    canojaVerified: { type: Boolean, default: false },
    adminVerificationRequired: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    dba: String,

    // Documents
    state_license_document: String,
    utility_bill: String,
    gps_validation: Boolean,

    // Classification
    smoke_shop: { type: Boolean, default: false, index: true },

    // Business Management
    visibility: { type: Boolean, default: true, index: true }, // User can hide/show shop
    menu: String, // URL to menu file (PDF or image)
    menuUploadedAt: { type: Date, default: null },
    view_count: { type: Number, default: 0 }, // Track engagement - number of views/clicks

    // Admin Panel additions (Phase 2) — all optional, no defaults that affect existing data
    lastVerifiedDate: { type: Date, default: null },
    dataCompletenessScore: { type: Number, default: null }, // 0-100
    sourceType: {
      type: String,
      enum: ["state_db", "manual", "ai_verified", null],
      default: null,
    },
    riskFlag: {
      type: String,
      enum: ["low", "medium", "high", null],
      default: null,
    },
    verificationLifecycle: [
      {
        status: String,
        at: { type: Date, default: Date.now },
        by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        note: String,
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Compute dataCompletenessScore before every save
licenseRecordSchema.pre("save", function (next) {
  const fields = [
    this.business_name,
    this.license_number,
    this.stateName,
    this.city,
    this.business_address,
    this.contact_information?.phone,
    this.contact_information?.email,
    this.expiration_date,
    this.license_type,
    this.owner?.name,
  ];
  const filled = fields.filter(
    (v) => v !== null && v !== undefined && v !== "",
  ).length;
  this.dataCompletenessScore = Math.round((filled / fields.length) * 100);
  next();
});

// Geospatial index
licenseRecordSchema.index({ location: "2dsphere" });

// Compound indexes for common queries
licenseRecordSchema.index({ city: 1, stateName: 1 });
licenseRecordSchema.index({ license_status: 1, license_type: 1 });
licenseRecordSchema.index({ smoke_shop: 1, city: 1 });
licenseRecordSchema.index({ rating: -1 });
licenseRecordSchema.index({ business_name: "text" });

for (const field of FLEXIBLE_DATE_FIELDS) {
  licenseRecordSchema.path(field)._castFunction = castFlexibleDate;
}

module.exports = mongoose.model(
  "LicenseRecord",
  licenseRecordSchema,
  "newlicenserecords",
);
