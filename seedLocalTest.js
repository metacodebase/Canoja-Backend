/**
 * seedLocalTest.js
 * Seeds unclaimed test businesses near San Francisco for local simulator testing.
 * Run with: node seedLocalTest.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/cannabis_licenses",
    );
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
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
      coordinates: { type: [Number] }, // [longitude, latitude]
    },
    latitude: Number,
    longitude: Number,
    rating: Number,
    reviews: Number,
    claimed: { type: Boolean, default: false },
    canojaVerified: { type: Boolean, default: false },
    visibility: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const LicenseRecord = mongoose.model(
  "LicenseRecord",
  licenseRecordSchema,
  "newlicenserecords",
);

// All businesses clustered within ~3km of San Francisco city centre
// so they appear together in the simulator regardless of the exact location set
const localTestBusinesses = [
  {
    business_name: "Golden Gate Greens",
    license_number: `LOCAL-SF-${Date.now()}-001`,
    type: "Dispensary",
    category: "Retail Cannabis",
    stateName: "California",
    city: "San Francisco",
    business_address: "100 Market St, San Francisco, CA 94105",
    contact_information: {
      phone: "(415) 111-0001",
      email: "hello@goldengategreens.com",
      website: "https://goldengategreens.com",
    },
    location: { type: "Point", coordinates: [-122.3959, 37.7929] },
    latitude: 37.7929,
    longitude: -122.3959,
    rating: 4.7,
    reviews: 210,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Haight Street Hemp Co",
    license_number: `LOCAL-SF-${Date.now()}-002`,
    type: "Dispensary",
    category: "Recreational Cannabis",
    stateName: "California",
    city: "San Francisco",
    business_address: "556 Haight St, San Francisco, CA 94117",
    contact_information: {
      phone: "(415) 111-0002",
      email: "info@haightstreethc.com",
      website: "https://haightstreethc.com",
    },
    location: { type: "Point", coordinates: [-122.4282, 37.7714] },
    latitude: 37.7714,
    longitude: -122.4282,
    rating: 4.5,
    reviews: 145,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Mission District Cannabis",
    license_number: `LOCAL-SF-${Date.now()}-003`,
    type: "Dispensary",
    category: "Medical & Recreational Cannabis",
    stateName: "California",
    city: "San Francisco",
    business_address: "2400 Mission St, San Francisco, CA 94110",
    contact_information: {
      phone: "(415) 111-0003",
      email: "contact@missioncannabis.com",
      website: "https://missioncannabis.com",
    },
    location: { type: "Point", coordinates: [-122.4194, 37.7599] },
    latitude: 37.7599,
    longitude: -122.4194,
    rating: 4.6,
    reviews: 98,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "SoMa Wellness Collective",
    license_number: `LOCAL-SF-${Date.now()}-004`,
    type: "Dispensary",
    category: "Retail Cannabis",
    stateName: "California",
    city: "San Francisco",
    business_address: "888 Brannan St, San Francisco, CA 94103",
    contact_information: {
      phone: "(415) 111-0004",
      email: "hello@somawellness.com",
      website: "https://somawellness.com",
    },
    location: { type: "Point", coordinates: [-122.4048, 37.7717] },
    latitude: 37.7717,
    longitude: -122.4048,
    rating: 4.8,
    reviews: 330,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Embarcadero Elevated",
    license_number: `LOCAL-SF-${Date.now()}-005`,
    type: "Dispensary",
    category: "Retail Cannabis",
    stateName: "California",
    city: "San Francisco",
    business_address: "1 Ferry Building, San Francisco, CA 94105",
    contact_information: {
      phone: "(415) 111-0005",
      email: "info@embarcaderoelevated.com",
      website: "https://embarcaderoelevated.com",
    },
    location: { type: "Point", coordinates: [-122.3942, 37.7955] },
    latitude: 37.7955,
    longitude: -122.3942,
    rating: 4.9,
    reviews: 420,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Castro Cannabis Club",
    license_number: `LOCAL-SF-${Date.now()}-006`,
    type: "Dispensary",
    category: "Medical Cannabis",
    stateName: "California",
    city: "San Francisco",
    business_address: "450 Castro St, San Francisco, CA 94114",
    contact_information: {
      phone: "(415) 111-0006",
      email: "club@castrocannabis.com",
      website: "https://castrocannabis.com",
    },
    location: { type: "Point", coordinates: [-122.435, 37.7609] },
    latitude: 37.7609,
    longitude: -122.435,
    rating: 4.4,
    reviews: 175,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
];

const seed = async () => {
  try {
    await connectDB();

    // Remove any previous LOCAL-SF test records to avoid duplicates on re-runs
    const deleted = await LicenseRecord.deleteMany({
      license_number: /^LOCAL-SF-/,
    });
    if (deleted.deletedCount > 0) {
      console.log(
        `🗑️  Removed ${deleted.deletedCount} previous LOCAL-SF test records`,
      );
    }

    const inserted = await LicenseRecord.insertMany(localTestBusinesses);
    console.log(
      `\n✅ Inserted ${inserted.length} unclaimed SF test businesses:\n`,
    );

    inserted.forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.business_name}`);
      console.log(`     License : ${b.license_number}`);
      console.log(`     Address : ${b.business_address}`);
      console.log(`     ID      : ${b._id}\n`);
    });

    console.log("📍 Simulator tip:");
    console.log("   Features → Location → Custom Location");
    console.log("   Latitude : 37.7749   Longitude: -122.4194\n");
  } catch (err) {
    console.error("❌ Seed error:", err);
  } finally {
    await mongoose.connection.close();
    console.log("👋 Done");
  }
};

seed();
