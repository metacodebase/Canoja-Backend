const mongoose = require("mongoose");
require("dotenv").config();

// Connect to MongoDB
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

// Define LicenseRecord schema (minimal version for seeding)
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

// Test data - Cannabis businesses in various states
const testBusinesses = [
  {
    business_name: "Green Leaf Dispensary",
    license_number: "CA-RET-2024-001",
    type: "Dispensary",
    category: "Retail Cannabis",
    stateName: "California",
    city: "Los Angeles",
    business_address: "123 Main St, Los Angeles, CA 90001",
    contact_information: {
      phone: "(555) 123-4567",
      email: "info@greenleaf.com",
      website: "https://greenleaf.com",
    },
    location: {
      type: "Point",
      coordinates: [-118.2437, 34.0522], // Los Angeles coordinates
    },
    latitude: 34.0522,
    longitude: -118.2437,
    rating: 4.5,
    reviews: 120,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Mile High Cannabis Co",
    license_number: "CO-RET-2024-002",
    type: "Dispensary",
    category: "Retail Cannabis",
    stateName: "Colorado",
    city: "Denver",
    business_address: "456 Broadway, Denver, CO 80202",
    contact_information: {
      phone: "(555) 234-5678",
      email: "contact@milehighcannabis.com",
      website: "https://milehighcannabis.com",
    },
    location: {
      type: "Point",
      coordinates: [-104.9903, 39.7392], // Denver coordinates
    },
    latitude: 39.7392,
    longitude: -104.9903,
    rating: 4.8,
    reviews: 250,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Emerald City Wellness",
    license_number: "WA-RET-2024-003",
    type: "Dispensary",
    category: "Medical & Recreational Cannabis",
    stateName: "Washington",
    city: "Seattle",
    business_address: "789 Pike St, Seattle, WA 98101",
    contact_information: {
      phone: "(555) 345-6789",
      email: "hello@emeraldcity.com",
      website: "https://emeraldcitywellness.com",
    },
    location: {
      type: "Point",
      coordinates: [-122.3321, 47.6062], // Seattle coordinates
    },
    latitude: 47.6062,
    longitude: -122.3321,
    rating: 4.7,
    reviews: 180,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Desert Bloom Dispensary",
    license_number: "AZ-RET-2024-004",
    type: "Dispensary",
    category: "Retail Cannabis",
    stateName: "Arizona",
    city: "Phoenix",
    business_address: "321 Central Ave, Phoenix, AZ 85004",
    contact_information: {
      phone: "(555) 456-7890",
      email: "info@desertbloom.com",
      website: "https://desertbloom.com",
    },
    location: {
      type: "Point",
      coordinates: [-112.074, 33.4484], // Phoenix coordinates
    },
    latitude: 33.4484,
    longitude: -112.074,
    rating: 4.6,
    reviews: 95,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Pacific Coast Cannabis",
    license_number: "CA-RET-2024-005",
    type: "Dispensary",
    category: "Recreational Cannabis",
    license_type: "Cannabis Retail License",
    stateName: "California",
    city: "San Francisco",
    business_address: "567 Market St, San Francisco, CA 94102",
    contact_information: {
      phone: "(555) 567-8901",
      email: "support@pacificcoastcannabis.com",
      website: "https://pacificcoastcannabis.com",
    },
    location: {
      type: "Point",
      coordinates: [-122.4194, 37.7749],
    },
    latitude: 37.7749,
    longitude: -122.4194,
    rating: 4.9,
    reviews: 310,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },

  // --- Additional dispensaries across states ---
  {
    business_name: "Magnolia Wellness Center",
    license_number: "OR-RET-2024-006",
    type: "Dispensary",
    category: "Medical & Recreational Cannabis",
    license_type: "Cannabis Retail License",
    stateName: "Oregon",
    city: "Portland",
    business_address: "1234 NE Alberta St, Portland, OR 97211",
    contact_information: {
      phone: "(503) 678-9012",
      email: "info@magnoliawellness.com",
      website: "https://magnoliawellness.com",
    },
    location: {
      type: "Point",
      coordinates: [-122.6549, 45.5586],
    },
    latitude: 45.5586,
    longitude: -122.6549,
    rating: 4.7,
    reviews: 198,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Lone Star Leaf",
    license_number: "TX-HEMP-2024-007",
    type: "Hemp Shop",
    category: "Hemp & CBD Retail",
    license_type: "Hemp Retailer License",
    stateName: "Texas",
    city: "Austin",
    business_address: "512 South Congress Ave, Austin, TX 78704",
    contact_information: {
      phone: "(512) 789-0123",
      email: "hello@lonestarlLeaf.com",
      website: "https://lonestarlleaf.com",
    },
    location: {
      type: "Point",
      coordinates: [-97.7501, 30.2502],
    },
    latitude: 30.2502,
    longitude: -97.7501,
    rating: 4.5,
    reviews: 143,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Windy City Wellness",
    license_number: "IL-RET-2024-008",
    type: "Dispensary",
    category: "Recreational Cannabis",
    license_type: "Cannabis Retail License",
    stateName: "Illinois",
    city: "Chicago",
    business_address: "900 N Michigan Ave, Chicago, IL 60611",
    contact_information: {
      phone: "(312) 890-1234",
      email: "contact@windycitywellness.com",
      website: "https://windycitywellness.com",
    },
    location: {
      type: "Point",
      coordinates: [-87.6244, 41.8983],
    },
    latitude: 41.8983,
    longitude: -87.6244,
    rating: 4.6,
    reviews: 265,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Green Mountain Dispensary",
    license_number: "VT-RET-2024-009",
    type: "Dispensary",
    category: "Retail Cannabis",
    license_type: "Cannabis Retail License",
    stateName: "Vermont",
    city: "Burlington",
    business_address: "200 Church St, Burlington, VT 05401",
    contact_information: {
      phone: "(802) 901-2345",
      email: "info@greenmountaindispensary.com",
      website: "https://greenmountaindispensary.com",
    },
    location: {
      type: "Point",
      coordinates: [-73.2121, 44.4759],
    },
    latitude: 44.4759,
    longitude: -73.2121,
    rating: 4.4,
    reviews: 87,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },

  // --- Smoke shops ---
  {
    business_name: "Rocky Mountain Smoke Shop",
    license_number: "CO-SMOKE-2024-010",
    type: "Smoke Shop",
    category: "Tobacco & Smoke Shop",
    license_type: "Tobacco Retailer Permit",
    smoke_shop: true,
    stateName: "Colorado",
    city: "Denver",
    business_address: "1600 17th St, Denver, CO 80202",
    contact_information: {
      phone: "(720) 012-3456",
      email: "rocky@mtsmokeshop.com",
      website: "",
    },
    location: {
      type: "Point",
      coordinates: [-104.9965, 39.7527],
    },
    latitude: 39.7527,
    longitude: -104.9965,
    rating: 4.1,
    reviews: 56,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Empire Smoke & Vape",
    license_number: "NY-SMOKE-2024-011",
    type: "Smoke Shop",
    category: "Tobacco & Smoke Shop",
    license_type: "Tobacco Retailer Permit",
    smoke_shop: true,
    stateName: "New York",
    city: "New York City",
    business_address: "350 5th Ave, New York, NY 10118",
    contact_information: {
      phone: "(212) 123-4567",
      email: "empire@smokevape.com",
      website: "https://empiresmokevape.com",
    },
    location: {
      type: "Point",
      coordinates: [-73.9857, 40.7484],
    },
    latitude: 40.7484,
    longitude: -73.9857,
    rating: 4.0,
    reviews: 74,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
  {
    business_name: "Sunshine Smoke Shop",
    license_number: "FL-SMOKE-2024-012",
    type: "Smoke Shop",
    category: "Tobacco & Smoke Shop",
    license_type: "Tobacco Retailer Permit",
    smoke_shop: true,
    stateName: "Florida",
    city: "Miami",
    business_address: "1200 Ocean Dr, Miami Beach, FL 33139",
    contact_information: {
      phone: "(305) 234-5678",
      email: "sunshine@smokeshopmiami.com",
      website: "https://sunshinesmokefl.com",
    },
    location: {
      type: "Point",
      coordinates: [-80.1302, 25.7784],
    },
    latitude: 25.7784,
    longitude: -80.1302,
    rating: 4.2,
    reviews: 91,
    claimed: false,
    canojaVerified: false,
    visibility: true,
  },
];

// Seed function
const seedDatabase = async () => {
  try {
    await connectDB();

    console.log("🌱 Seeding test data...\n");

    // Clear existing test data (optional - comment out if you want to keep existing data)
    const existingCount = await LicenseRecord.countDocuments();
    console.log(`📊 Current businesses in database: ${existingCount}`);

    // Uncomment the line below to clear all data before seeding
    // await LicenseRecord.deleteMany({});
    // console.log('🗑️  Cleared existing data');

    // Insert test businesses
    const inserted = await LicenseRecord.insertMany(testBusinesses);

    console.log(
      `\n✅ Successfully inserted ${inserted.length} test businesses!\n`,
    );

    // Display inserted businesses
    console.log("📋 Inserted Businesses:");
    console.log("═".repeat(80));
    inserted.forEach((business, index) => {
      console.log(`\n${index + 1}. ${business.business_name}`);
      console.log(`   License #: ${business.license_number}`);
      console.log(`   Location: ${business.city}, ${business.stateName}`);
      console.log(`   Address: ${business.business_address}`);
      console.log(`   Phone: ${business.contact_information.phone}`);
      console.log(`   Email: ${business.contact_information.email}`);
      console.log(`   ID: ${business._id}`);
    });

    console.log("\n" + "═".repeat(80));
    console.log("\n📝 Next Steps:");
    console.log("1. Start your backend server: cd Canoja-Backend && npm start");
    console.log("2. Open your mobile app");
    console.log("3. Find one of these businesses");
    console.log('4. Click "Claim Business"');
    console.log("5. Fill out the claim form with your email");
    console.log(
      "6. Admin approves the claim (you can do this manually in the database or via admin panel)",
    );
    console.log("7. You'll receive credentials via email");
    console.log("8. Login and test the refresh token feature!\n");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
  } finally {
    await mongoose.connection.close();
    console.log("👋 Database connection closed");
  }
};

// Run the seeder
seedDatabase();
