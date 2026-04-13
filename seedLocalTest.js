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

  // --- Additional dispensaries ---
  {
    business_name: "Tenderloin Terps",
    license_number: `LOCAL-SF-${Date.now()}-007`,
    type: "Dispensary",
    category: "Retail Cannabis",
    license_type: "Cannabis Retail License",
    stateName: "California",
    city: "San Francisco",
    business_address: "342 Turk St, San Francisco, CA 94102",
    contact_information: {
      phone: "(415) 222-0007",
      email: "info@tltterps.com",
      website: "https://tenderloinaerps.com",
    },
    location: { type: "Point", coordinates: [-122.4148, 37.7833] },
    latitude: 37.7833,
    longitude: -122.4148,
    rating: 4.2,
    reviews: 88,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Nob Hill Naturals",
    license_number: `LOCAL-SF-${Date.now()}-008`,
    type: "Dispensary",
    category: "Medical & Recreational Cannabis",
    license_type: "Cannabis Retail License",
    stateName: "California",
    city: "San Francisco",
    business_address: "1120 California St, San Francisco, CA 94108",
    contact_information: {
      phone: "(415) 222-0008",
      email: "hello@nobhillnaturals.com",
      website: "https://nobhillnaturals.com",
    },
    location: { type: "Point", coordinates: [-122.4155, 37.7918] },
    latitude: 37.7918,
    longitude: -122.4155,
    rating: 4.6,
    reviews: 203,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Richmond Roots Dispensary",
    license_number: `LOCAL-SF-${Date.now()}-009`,
    type: "Dispensary",
    category: "Recreational Cannabis",
    license_type: "Cannabis Retail License",
    stateName: "California",
    city: "San Francisco",
    business_address: "614 Clement St, San Francisco, CA 94118",
    contact_information: {
      phone: "(415) 222-0009",
      email: "roots@richmonddispensary.com",
      website: "https://richmondrootsdispensary.com",
    },
    location: { type: "Point", coordinates: [-122.4647, 37.7826] },
    latitude: 37.7826,
    longitude: -122.4647,
    rating: 4.5,
    reviews: 156,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Sunset Strip Cannabis",
    license_number: `LOCAL-SF-${Date.now()}-010`,
    type: "Dispensary",
    category: "Retail Cannabis",
    license_type: "Cannabis Retail License",
    stateName: "California",
    city: "San Francisco",
    business_address: "1901 Irving St, San Francisco, CA 94122",
    contact_information: {
      phone: "(415) 222-0010",
      email: "info@sunsetstripca.com",
      website: "https://sunsetstripcannabis.com",
    },
    location: { type: "Point", coordinates: [-122.4779, 37.7638] },
    latitude: 37.7638,
    longitude: -122.4779,
    rating: 4.3,
    reviews: 112,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Bay Area Botanicals",
    license_number: `LOCAL-SF-${Date.now()}-011`,
    type: "Dispensary",
    category: "Medical Cannabis",
    license_type: "Cannabis Retail License",
    stateName: "California",
    city: "San Francisco",
    business_address: "55 8th St, San Francisco, CA 94103",
    contact_information: {
      phone: "(415) 222-0011",
      email: "hello@bayareabotanicals.com",
      website: "https://bayareabotanicals.com",
    },
    location: { type: "Point", coordinates: [-122.4096, 37.7749] },
    latitude: 37.7749,
    longitude: -122.4096,
    rating: 4.7,
    reviews: 278,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },

  // --- Smoke shops ---
  {
    business_name: "The Smoke Spot SF",
    license_number: `LOCAL-SF-${Date.now()}-012`,
    type: "Smoke Shop",
    category: "Tobacco & Smoke Shop",
    license_type: "Tobacco Retailer Permit",
    smoke_shop: true,
    stateName: "California",
    city: "San Francisco",
    business_address: "788 Market St, San Francisco, CA 94102",
    contact_information: {
      phone: "(415) 333-0012",
      email: "smokespotSF@gmail.com",
      website: "",
    },
    location: { type: "Point", coordinates: [-122.4069, 37.7846] },
    latitude: 37.7846,
    longitude: -122.4069,
    rating: 4.1,
    reviews: 64,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Hazel's Smoke & Vape",
    license_number: `LOCAL-SF-${Date.now()}-013`,
    type: "Smoke Shop",
    category: "Tobacco & Smoke Shop",
    license_type: "Tobacco Retailer Permit",
    smoke_shop: true,
    stateName: "California",
    city: "San Francisco",
    business_address: "2210 Mission St, San Francisco, CA 94110",
    contact_information: {
      phone: "(415) 333-0013",
      email: "hazels@smokeandvapesf.com",
      website: "https://hazelssmokeandvape.com",
    },
    location: { type: "Point", coordinates: [-122.4191, 37.7618] },
    latitude: 37.7618,
    longitude: -122.4191,
    rating: 4.0,
    reviews: 47,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Cloud Nine Smoke Shop",
    license_number: `LOCAL-SF-${Date.now()}-014`,
    type: "Smoke Shop",
    category: "Tobacco & Smoke Shop",
    license_type: "Tobacco Retailer Permit",
    smoke_shop: true,
    stateName: "California",
    city: "San Francisco",
    business_address: "1444 Polk St, San Francisco, CA 94109",
    contact_information: {
      phone: "(415) 333-0014",
      email: "info@cloudninesf.com",
      website: "https://cloudninesf.com",
    },
    location: { type: "Point", coordinates: [-122.4205, 37.7882] },
    latitude: 37.7882,
    longitude: -122.4205,
    rating: 4.3,
    reviews: 93,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Fog City Tobacco & Gifts",
    license_number: `LOCAL-SF-${Date.now()}-015`,
    type: "Smoke Shop",
    category: "Tobacco & Smoke Shop",
    license_type: "Tobacco Retailer Permit",
    smoke_shop: true,
    stateName: "California",
    city: "San Francisco",
    business_address: "330 Columbus Ave, San Francisco, CA 94133",
    contact_information: {
      phone: "(415) 333-0015",
      email: "fogcity@tobaccogifts.com",
      website: "",
    },
    location: { type: "Point", coordinates: [-122.4074, 37.7997] },
    latitude: 37.7997,
    longitude: -122.4074,
    rating: 3.9,
    reviews: 38,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Upper Haight Headshop",
    license_number: `LOCAL-SF-${Date.now()}-016`,
    type: "Smoke Shop",
    category: "Tobacco & Smoke Shop",
    license_type: "Tobacco Retailer Permit",
    smoke_shop: true,
    stateName: "California",
    city: "San Francisco",
    business_address: "1630 Haight St, San Francisco, CA 94117",
    contact_information: {
      phone: "(415) 333-0016",
      email: "upperhaight@headshop.com",
      website: "https://upperhaightheadshop.com",
    },
    location: { type: "Point", coordinates: [-122.4481, 37.7693] },
    latitude: 37.7693,
    longitude: -122.4481,
    rating: 4.4,
    reviews: 121,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Chinatown Smoke & More",
    license_number: `LOCAL-SF-${Date.now()}-017`,
    type: "Smoke Shop",
    category: "Tobacco & Smoke Shop",
    license_type: "Tobacco Retailer Permit",
    smoke_shop: true,
    stateName: "California",
    city: "San Francisco",
    business_address: "840 Grant Ave, San Francisco, CA 94108",
    contact_information: {
      phone: "(415) 333-0017",
      email: "",
      website: "",
    },
    location: { type: "Point", coordinates: [-122.4065, 37.7941] },
    latitude: 37.7941,
    longitude: -122.4065,
    rating: 3.8,
    reviews: 29,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
];

const seed = async () => {
  try {
    await connectDB();

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
