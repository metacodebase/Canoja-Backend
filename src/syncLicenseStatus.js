// syncLicenseStatus.js
const mongoose = require("mongoose");

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/cannabis_licenses";

// Haversine Distance (meters)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (x) => (x * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Enhanced name normalization
function enhancedNormalizeName(name) {
  if (!name) return "";

  return name
    .toLowerCase()
    .replace(
      /\b(llc|inc|corp|ltd|co|company|dispensary|cannabis|marijuana)\b/g,
      "",
    )
    .replace(/[^a-z0-9]/g, "")
    .replace(/\s+/g, "");
}

// Calculate similarity score (0-1)
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

// Levenshtein distance
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// Main matching function - returns match with license status
function matchShopWithLicenses(newShop, licensedShops) {
  if (
    !newShop.location ||
    !newShop.location.coordinates ||
    newShop.location.coordinates.length < 2
  ) {
    return null;
  }

  const [newLng, newLat] = newShop.location.coordinates;

  if (!newLat || !newLng || isNaN(newLat) || isNaN(newLng)) {
    return null;
  }

  const newShopName = enhancedNormalizeName(newShop.business_name);
  const newShopDba = enhancedNormalizeName(newShop.dba);

  let bestMatch = null;
  let bestMatchScore = 0;

  for (const licensed of licensedShops) {
    if (
      !licensed.location ||
      !licensed.location.coordinates ||
      licensed.location.coordinates.length < 2
    ) {
      continue;
    }

    const [licensedLng, licensedLat] = licensed.location.coordinates;

    if (
      !licensedLat ||
      !licensedLng ||
      isNaN(licensedLat) ||
      isNaN(licensedLng)
    ) {
      continue;
    }

    const distance = haversineDistance(
      newLat,
      newLng,
      licensedLat,
      licensedLng,
    );

    if (distance > 100) {
      continue;
    }

    const licensedBusinessName = enhancedNormalizeName(licensed.business_name);
    const licensedDba = enhancedNormalizeName(licensed.dba);

    // Exact matches
    const exactBusinessMatch = newShopName === licensedBusinessName;
    const exactDbaMatch =
      newShopDba && licensedDba && newShopDba === licensedDba;

    if (exactBusinessMatch || exactDbaMatch) {
      return {
        licensedShop: licensed,
        distance: distance,
        matchType: exactBusinessMatch ? "exact_business_name" : "exact_dba",
        matchScore: 1.0,
        license_status: licensed.license_status, // ← Include actual status
      };
    }

    // Fuzzy matching
    const businessNameSimilarity = calculateSimilarity(
      newShopName,
      licensedBusinessName,
    );
    const dbaSimilarity =
      newShopDba && licensedDba
        ? calculateSimilarity(newShopDba, licensedDba)
        : 0;

    const bestSimilarity = Math.max(businessNameSimilarity, dbaSimilarity);

    if (bestSimilarity >= 0.8) {
      const distanceBonus = (100 - distance) / 100;
      const compositeScore = bestSimilarity * 0.7 + distanceBonus * 0.3;

      if (compositeScore > bestMatchScore) {
        bestMatchScore = compositeScore;
        bestMatch = {
          licensedShop: licensed,
          distance: distance,
          matchType:
            businessNameSimilarity > dbaSimilarity
              ? "fuzzy_business_name"
              : "fuzzy_dba",
          matchScore: bestSimilarity,
          license_status: licensed.license_status, // ← Include actual status
        };
      }
    }
  }

  return bestMatch;
}

// Main sync function
async function syncLicenseStatus() {
  console.log("🚀 Starting License Status Sync...\n");

  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB\n");

    const NewLicenseRecords =
      mongoose.connection.collection("newlicenserecords");
    const LicensedShops = mongoose.connection.collection("licenserecords");

    // Fetch ALL licensed shops (not just Active) - but they need coordinates
    console.log("📥 Fetching licensed shops from source of truth...");
    const licensedShops = await LicensedShops.find({
      "location.coordinates": { $exists: true, $ne: [] },
      "location.coordinates.0": { $exists: true },
      "location.coordinates.1": { $exists: true },
    }).toArray();

    console.log(
      `   Found ${licensedShops.length} licensed shops with coordinates\n`,
    );

    // Count by status
    const statusCounts = {};
    licensedShops.forEach((shop) => {
      const status = shop.license_status || "Unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    console.log("   Status breakdown:");
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`     ${status}: ${count}`);
    });
    console.log();

    // Fetch all shops from newlicenserecords
    console.log("📥 Fetching shops from newlicenserecords...");
    const newShops = await NewLicenseRecords.find({
      "location.coordinates": { $exists: true, $ne: [] },
      "location.coordinates.0": { $exists: true },
      "location.coordinates.1": { $exists: true },
    }).toArray();

    console.log(`   Found ${newShops.length} shops in newlicenserecords\n`);

    // Statistics
    let matchedActive = 0;
    let matchedInactive = 0;
    let notMatched = 0;
    let updated = 0;
    let alreadySynced = 0;
    let errors = 0;

    const matchDetails = [];

    console.log("🔄 Starting matching process...\n");

    for (let i = 0; i < newShops.length; i++) {
      const shop = newShops[i];

      try {
        const match = matchShopWithLicenses(shop, licensedShops);

        let targetStatus = "Inactive"; // Default if not matched
        let shouldUpdate = false;

        if (match) {
          // Shop found in licenserecords
          targetStatus = match.license_status; // Use actual status from source of truth

          if (match.license_status === "Active") {
            matchedActive++;
          } else {
            matchedInactive++;
          }

          const matchInfo = {
            newShopName: shop.business_name,
            newShopId: shop._id,
            licensedShopName: match.licensedShop.business_name,
            licenseNumber: match.licensedShop.license_number,
            distance: `${Math.round(match.distance)}m`,
            matchType: match.matchType,
            matchScore: match.matchScore.toFixed(2),
            currentStatus: shop.license_status,
            targetStatus: targetStatus,
          };

          matchDetails.push(matchInfo);

          // Check if update is needed
          if (shop.license_status !== targetStatus || !shop.canojaVerified) {
            shouldUpdate = true;
          }
        } else {
          // Shop NOT found in licenserecords
          notMatched++;
          targetStatus = "Inactive";

          // Check if update is needed
          if (
            shop.license_status !== "Inactive" ||
            shop.canojaVerified !== false
          ) {
            shouldUpdate = true;
          }
        }

        // Perform update if needed
        if (shouldUpdate) {
          if (match) {
            // Matched - update with license info
            await NewLicenseRecords.updateOne(
              { _id: shop._id },
              {
                $set: {
                  license_status: targetStatus,
                  license_number: match.licensedShop.license_number,
                  license_type: match.licensedShop.license_type,
                  canojaVerified: targetStatus === "Active",
                  issue_date: match.licensedShop.issue_date,
                  expiration_date: match.licensedShop.expiration_date,
                  dba: match.licensedShop.dba || shop.dba,
                },
              },
            );
          } else {
            // Not matched - mark as inactive
            await NewLicenseRecords.updateOne(
              { _id: shop._id },
              {
                $set: {
                  license_status: "Inactive",
                  canojaVerified: false,
                },
              },
            );
          }

          updated++;

          if (match) {
            console.log(
              `✅ [${i + 1}/${newShops.length}] UPDATED: ${shop.business_name} → ${targetStatus}`,
            );
          } else {
            console.log(
              `⚪ [${i + 1}/${newShops.length}] NO MATCH: ${shop.business_name} → Inactive`,
            );
          }
        } else {
          alreadySynced++;
          if ((i + 1) % 100 === 0) {
            console.log(`⏭️  [${i + 1}/${newShops.length}] Already synced`);
          }
        }
      } catch (error) {
        errors++;
        console.error(
          `❌ Error processing shop ${shop.business_name}:`,
          error.message,
        );
      }

      if ((i + 1) % 100 === 0) {
        console.log(
          `\n📊 Progress: ${i + 1}/${newShops.length} (${(((i + 1) / newShops.length) * 100).toFixed(1)}%)`,
        );
        console.log(
          `   Matched Active: ${matchedActive}, Matched Inactive: ${matchedInactive}, Not Matched: ${notMatched}, Updated: ${updated}\n`,
        );
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ SYNC COMPLETE!");
    console.log("=".repeat(80));
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total shops processed: ${newShops.length}`);
    console.log(
      `   Matched with Active licenses: ${matchedActive} (${((matchedActive / newShops.length) * 100).toFixed(1)}%)`,
    );
    console.log(
      `   Matched with Inactive/Other licenses: ${matchedInactive} (${((matchedInactive / newShops.length) * 100).toFixed(1)}%)`,
    );
    console.log(
      `   Not matched (set to Inactive): ${notMatched} (${((notMatched / newShops.length) * 100).toFixed(1)}%)`,
    );
    console.log(`   Updated: ${updated}`);
    console.log(`   Already synced: ${alreadySynced}`);
    console.log(`   Errors: ${errors}`);

    // Sample matches
    if (matchDetails.length > 0) {
      console.log(`\n📝 Sample Matches (first 10):`);
      matchDetails.slice(0, 10).forEach((detail, idx) => {
        console.log(`\n${idx + 1}. ${detail.newShopName}`);
        console.log(`   Matched with: ${detail.licensedShopName}`);
        console.log(`   License: ${detail.licenseNumber}`);
        console.log(`   Distance: ${detail.distance}`);
        console.log(
          `   Match type: ${detail.matchType} (score: ${detail.matchScore})`,
        );
        console.log(
          `   Status: ${detail.currentStatus} → ${detail.targetStatus}`,
        );
      });
    }

    await mongoose.connection.close();
    console.log("\n✅ MongoDB connection closed");
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  syncLicenseStatus()
    .then(() => {
      console.log("\n🎉 Script completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Script failed:", error);
      process.exit(1);
    });
}

module.exports = { syncLicenseStatus };
