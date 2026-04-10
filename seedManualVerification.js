/**
 * seedManualVerification.js
 *
 * Seeds unclaimed cannabis businesses near San Francisco so you can test
 * the full manual-verification flow end-to-end:
 *
 *   1. Open the mobile app → find one of these businesses
 *   2. Tap "Claim Business" and go through the onboarding form
 *      (enter any license number — it won't match, triggering manual review)
 *   3. Admin portal → approve the pending request
 *   4. Operator logs in and sees their dashboard
 *
 * Run with: node seedManualVerification.js
 * Clean up:  node seedManualVerification.js --clean
 *
 * Simulator tip: Features → Location → Custom Location
 *   Latitude: 37.7749   Longitude: -122.4194
 */

const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  await mongoose.connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/cannabis_licenses",
  );
  console.log("✅ MongoDB connected");
};

const licenseRecordSchema = new mongoose.Schema(
  {
    business_name: String,
    license_number: { type: String, index: true },
    type: String,
    category: String,
    stateName: { type: String, index: true },
    city: { type: String, index: true },
    business_address: String,
    contact_information: {
      phone: String,
      email: String,
      website: String,
    },
    location: {
      type: { type: String, default: "Point" },
      coordinates: { type: [Number] },
    },
    latitude: Number,
    longitude: Number,
    rating: Number,
    reviews: Number,
    smoke_shop: { type: Boolean, default: false },
    claimed: { type: Boolean, default: false },
    canojaVerified: { type: Boolean, default: false },
    visibility: { type: Boolean, default: true },
    view_count: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const LicenseRecord =
  mongoose.models.LicenseRecord ||
  mongoose.model("LicenseRecord", licenseRecordSchema, "newlicenserecords");

// ─── Businesses ───────────────────────────────────────────────────────────────
// All near San Francisco city centre (~3 km radius).
// license_number prefix MANUAL-VER-TEST guarantees --clean only removes these.
// Some have a scraped email, some don't — covers both UI states on the detail screen.

const TAG = "MANUAL-VER-TEST";

const businesses = [
  {
    // Has scraped email → shown on consumer detail screen
    business_name: "Bay Area Botanicals",
    license_number: `${TAG}-001`,
    type: "Dispensary",
    category: "Recreational Cannabis",
    stateName: "California",
    city: "San Francisco",
    business_address: "1200 Valencia St, San Francisco, CA 94110",
    contact_information: {
      phone: "(415) 222-0001",
      email: "info@bayareabotanicals.com",
      website: "https://bayareabotanicals.com",
    },
    location: { type: "Point", coordinates: [-122.421, 37.7574] },
    latitude: 37.7574,
    longitude: -122.421,
    rating: 4.6,
    reviews: 88,
    smoke_shop: false,
  },
  {
    // No scraped email → shows "email not available" on consumer detail screen
    business_name: "Tenderloin Terps",
    license_number: `${TAG}-002`,
    type: "Dispensary",
    category: "Medical & Recreational Cannabis",
    stateName: "California",
    city: "San Francisco",
    business_address: "340 Turk St, San Francisco, CA 94102",
    contact_information: {
      phone: "(415) 222-0002",
      email: "",
      website: "https://tenderlointemps.com",
    },
    location: { type: "Point", coordinates: [-122.4148, 37.7832] },
    latitude: 37.7832,
    longitude: -122.4148,
    rating: 4.3,
    reviews: 52,
    smoke_shop: false,
  },
  {
    // No scraped email, no website either
    business_name: "Nob Hill Naturals",
    license_number: `${TAG}-003`,
    type: "Dispensary",
    category: "Medical Cannabis",
    stateName: "California",
    city: "San Francisco",
    business_address: "910 California St, San Francisco, CA 94108",
    contact_information: {
      phone: "(415) 222-0003",
      email: "",
      website: "",
    },
    location: { type: "Point", coordinates: [-122.4134, 37.7916] },
    latitude: 37.7916,
    longitude: -122.4134,
    rating: 4.1,
    reviews: 31,
    smoke_shop: false,
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

const seed = async () => {
  await connectDB();

  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }

  console.log("\n🌱 Seeding unclaimed cannabis businesses...\n");

  // Remove previous run first to avoid duplicates
  await clean(false);

  for (const biz of businesses) {
    const record = await LicenseRecord.create(biz);
    console.log(`✅ ${biz.business_name}`);
    console.log(`   ID      : ${record._id}`);
    console.log(`   Address : ${biz.business_address}`);
    console.log(
      `   Email   : ${biz.contact_information.email || "(none — shows 'email not available')"}`,
    );
    console.log();
  }

  console.log("═".repeat(60));
  console.log("\n📋 What to do next:");
  console.log("  1. Open the mobile app (simulator at 37.7749, -122.4194)");
  console.log("  2. Find one of the businesses above");
  console.log("  3. Tap 'Claim Business' → fill out the onboarding form");
  console.log(
    "     (enter any license number — mismatch triggers manual review)",
  );
  console.log("  4. Log into the admin portal and approve the request");
  console.log("  5. Log in as the operator → dashboard should appear\n");
  console.log("🧹 To remove all seeded businesses:");
  console.log("   node seedManualVerification.js --clean\n");
};

const clean = async (log = true) => {
  const result = await LicenseRecord.deleteMany({
    license_number: new RegExp(`^${TAG}-`),
  });
  if (log) {
    console.log(
      `🗑️  Removed ${result.deletedCount} MANUAL-VER-TEST LicenseRecords`,
    );
  }
};

seed()
  .catch((err) => {
    console.error("❌ Seed error:", err);
    process.exit(1);
  })
  .finally(() =>
    mongoose.connection.close().then(() => console.log("👋 Done")),
  );
