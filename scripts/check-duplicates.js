const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Import all regional shop models
const Shop = require("../src/models/shop");

dotenv.config();

// Define all regions with their models and collection names
const REGIONS = {
  colorado: {
    model: Shop,
    name: "Allshops",
    collection: "All_Shops",
  },
};

async function checkDuplicates(regionKey, showExamples = 3) {
  const region = REGIONS[regionKey];
  if (!region) {
    throw new Error(
      `Unknown region: ${regionKey}. Available regions: ${Object.keys(REGIONS).join(", ")}`,
    );
  }

  try {
    // Check for duplicates by place_id
    const placeIdDuplicates = await region.model.aggregate([
      {
        $group: {
          _id: "$place_id",
          ids: { $push: "$_id" },
          names: { $push: "$name" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Check for potential duplicates by name (case-insensitive)
    const nameDuplicates = await region.model.aggregate([
      {
        $group: {
          _id: { $toLower: "$name" },
          ids: { $push: "$_id" },
          names: { $push: "$name" },
          place_ids: { $push: "$place_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Check for potential duplicates by coordinates (within 10 meters)
    const coordinateDuplicates = await region.model.aggregate([
      {
        $group: {
          _id: {
            lat: { $round: ["$lat", 4] }, // Round to ~10m precision
            lng: { $round: ["$lng", 4] },
          },
          ids: { $push: "$_id" },
          names: { $push: "$name" },
          place_ids: { $push: "$place_id" },
          coordinates: { $push: { lat: "$lat", lng: "$lng" } },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Get total document count for percentage calculations
    const totalCount = await region.model.countDocuments();

    return {
      region: region.name,
      collection: region.collection,
      totalShops: totalCount,
      duplicates: {
        byPlaceId: {
          duplicateGroups: placeIdDuplicates.length,
          totalDuplicateRecords: placeIdDuplicates.reduce(
            (sum, group) => sum + group.count,
            0,
          ),
          examples: placeIdDuplicates.slice(0, showExamples).map((group) => ({
            place_id: group._id,
            count: group.count,
            names: [...new Set(group.names)], // Remove duplicate names
            record_ids: group.ids,
          })),
        },
        byName: {
          duplicateGroups: nameDuplicates.length,
          totalDuplicateRecords: nameDuplicates.reduce(
            (sum, group) => sum + group.count,
            0,
          ),
          examples: nameDuplicates.slice(0, showExamples).map((group) => ({
            normalized_name: group._id,
            count: group.count,
            actual_names: group.names,
            place_ids: group.place_ids,
            record_ids: group.ids,
          })),
        },
        byCoordinates: {
          duplicateGroups: coordinateDuplicates.length,
          totalDuplicateRecords: coordinateDuplicates.reduce(
            (sum, group) => sum + group.count,
            0,
          ),
          examples: coordinateDuplicates
            .slice(0, showExamples)
            .map((group) => ({
              rounded_coordinates: group._id,
              count: group.count,
              names: group.names,
              place_ids: group.place_ids,
              actual_coordinates: group.coordinates,
              record_ids: group.ids,
            })),
        },
      },
      summary: {
        hasPlaceIdDuplicates: placeIdDuplicates.length > 0,
        hasNameDuplicates: nameDuplicates.length > 0,
        hasCoordinateDuplicates: coordinateDuplicates.length > 0,
        placeIdDuplicatePercentage:
          totalCount > 0
            ? Number(
                (
                  (placeIdDuplicates.reduce(
                    (sum, group) => sum + group.count,
                    0,
                  ) /
                    totalCount) *
                  100
                ).toFixed(2),
              )
            : 0,
        potentialCleanupOpportunities:
          placeIdDuplicates.length +
          nameDuplicates.length +
          coordinateDuplicates.length,
      },
    };
  } catch (error) {
    throw new Error(
      `Error checking duplicates in ${region.name}: ${error.message}`,
    );
  }
}

async function checkAllRegionsDuplicates(showExamples = 2) {
  const results = {};

  for (const [regionKey, region] of Object.entries(REGIONS)) {
    try {
      results[regionKey] = await checkDuplicates(regionKey, showExamples);
    } catch (error) {
      results[regionKey] = {
        region: region.name,
        collection: region.collection,
        error: error.message,
      };
    }
  }

  return results;
}

async function generateCleanupScript(regionKey, duplicateType = "place_id") {
  const region = REGIONS[regionKey];
  if (!region) {
    throw new Error(`Unknown region: ${regionKey}`);
  }

  let aggregationPipeline;

  switch (duplicateType) {
    case "place_id":
      aggregationPipeline = [
        {
          $group: {
            _id: "$place_id",
            ids: { $push: "$_id" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ];
      break;
    case "name":
      aggregationPipeline = [
        {
          $group: {
            _id: { $toLower: "$name" },
            ids: { $push: "$_id" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ];
      break;
    default:
      throw new Error(`Unsupported duplicate type: ${duplicateType}`);
  }

  const duplicates = await region.model.aggregate(aggregationPipeline);

  const cleanupCommands = duplicates.map((group) => {
    const idsToDelete = group.ids.slice(1); // Keep the first one, delete the rest
    return `db.getCollection("${region.collection}").deleteMany({_id: {$in: [${idsToDelete.map((id) => `ObjectId("${id}")`).join(", ")}]}});`;
  });

  return {
    region: region.name,
    duplicateType,
    totalDuplicateGroups: duplicates.length,
    totalRecordsToDelete: duplicates.reduce(
      (sum, group) => sum + (group.count - 1),
      0,
    ),
    cleanupScript: cleanupCommands.join("\n"),
  };
}

(async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set in environment variables");
    }

    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Connected to MongoDB successfully\n");

    // Parse command line arguments
    const args = process.argv.slice(2);
    const regionArg = args.find((arg) => !arg.startsWith("--"));
    const examplesArg = args.find((arg) => arg.startsWith("--examples="));
    const cleanupArg = args.find((arg) => arg.startsWith("--cleanup="));
    const showExamples = examplesArg ? parseInt(examplesArg.split("=")[1]) : 3;

    if (cleanupArg) {
      // Generate cleanup script
      const [region, duplicateType] = cleanupArg.split("=")[1].split(":");
      if (!region || !REGIONS[region]) {
        console.error(
          `Error: Invalid region for cleanup. Use format --cleanup=region:type`,
        );
        console.log(`Available regions: ${Object.keys(REGIONS).join(", ")}`);
        process.exitCode = 1;
        return;
      }

      const cleanupScript = await generateCleanupScript(
        region,
        duplicateType || "place_id",
      );
      console.log(JSON.stringify(cleanupScript, null, 2));
    } else if (regionArg && regionArg !== "all") {
      // Check specific region
      if (!REGIONS[regionArg]) {
        console.error(`Error: Unknown region '${regionArg}'`);
        console.log(`Available regions: ${Object.keys(REGIONS).join(", ")}`);
        process.exitCode = 1;
        return;
      }

      const result = await checkDuplicates(regionArg, showExamples);
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Check all regions
      const results = await checkAllRegionsDuplicates(showExamples);
      console.log(JSON.stringify(results, null, 2));
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
      console.log("\nDisconnected from MongoDB");
    } catch (disconnectError) {
      console.error("Error disconnecting:", disconnectError.message);
    }
  }
})();

// Export functions for potential use in other scripts
module.exports = {
  checkDuplicates,
  checkAllRegionsDuplicates,
  generateCleanupScript,
  REGIONS,
};
