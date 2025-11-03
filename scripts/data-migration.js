const mongoose = require("mongoose");
require("dotenv").config();

// Import unified shop model
const Shop = require("../src/models/shop");
const Region = require("../src/models/region");

// Region configurations - now all use the unified Shop model with region filtering
const REGIONS = {
  colorado: {
    model: Shop,
    name: "Colorado",
    code: "CO",
    filter: { region: "colorado" },
  },
  michigan: {
    model: Shop,
    name: "Michigan",
    code: "MI",
    filter: { region: "michigan" },
  },
  canada: {
    model: Shop,
    name: "Canada",
    code: "CA",
    filter: { region: "canada" },
  },
  jamaica: {
    model: Shop,
    name: "Jamaica",
    code: "JM",
    filter: { region: "jamaica" },
  },
  usvirginislands: {
    model: Shop,
    name: "US Virgin Islands",
    code: "VI",
    filter: { region: "usvirginislands" },
  },
};

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

// Backup a region's data to JSON file
async function backupRegion(regionKey, outputPath) {
  const region = REGIONS[regionKey];
  if (!region) {
    throw new Error(`Unknown region: ${regionKey}`);
  }

  console.log(`📦 Backing up ${region.name} data...`);

  try {
    const shops = await region.model.find(region.filter || {}).lean();
    const fs = require("fs");
    const path = require("path");

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write backup file
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          region: region.name,
          code: region.code,
          exportDate: new Date().toISOString(),
          count: shops.length,
          data: shops,
        },
        null,
        2,
      ),
    );

    console.log(
      `✅ Backup completed: ${shops.length} shops saved to ${outputPath}`,
    );
    return shops.length;
  } catch (error) {
    console.error(`❌ Backup failed for ${region.name}:`, error);
    throw error;
  }
}

// Restore data from JSON backup to a region
async function restoreRegion(regionKey, inputPath, options = {}) {
  const region = REGIONS[regionKey];
  if (!region) {
    throw new Error(`Unknown region: ${regionKey}`);
  }

  const {
    dryRun = false,
    clearExisting = false,
    skipDuplicates = true,
  } = options;

  console.log(`📥 Restoring ${region.name} data from ${inputPath}...`);

  try {
    const fs = require("fs");
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Backup file not found: ${inputPath}`);
    }

    const backup = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    console.log(
      `📄 Backup info: ${backup.count} shops from ${backup.region} (${backup.exportDate})`,
    );

    if (dryRun) {
      console.log("🔍 DRY RUN MODE - No changes will be made");
    }

    // Clear existing data if requested
    if (clearExisting && !dryRun) {
      const deleteCount = await region.model.deleteMany({});
      console.log(`🗑️  Cleared ${deleteCount.deletedCount} existing shops`);
    }

    let insertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const shop of backup.data) {
      try {
        // Remove MongoDB-specific fields
        delete shop._id;
        delete shop.__v;

        // Add region field for unified model
        shop.region = regionKey;

        if (!dryRun) {
          if (skipDuplicates) {
            // Check for existing shop by place_id and region
            const existing = await region.model.findOne({
              place_id: shop.place_id,
              region: regionKey,
            });
            if (existing) {
              skippedCount++;
              continue;
            }
          }

          await region.model.create(shop);
        }
        insertedCount++;
      } catch (error) {
        errorCount++;
        if (errorCount <= 5) {
          // Show first 5 errors
          console.error(
            `❌ Error inserting shop ${shop.name || shop.place_id}:`,
            error.message,
          );
        }
      }
    }

    console.log(`✅ Restore completed:`);
    console.log(`   Inserted: ${insertedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Errors: ${errorCount}`);

    return { insertedCount, skippedCount, errorCount };
  } catch (error) {
    console.error(`❌ Restore failed for ${region.name}:`, error);
    throw error;
  }
}

// Copy data from one region to another
async function copyRegionData(sourceRegion, targetRegion, options = {}) {
  const source = REGIONS[sourceRegion];
  const target = REGIONS[targetRegion];

  if (!source || !target) {
    throw new Error(`Invalid regions: ${sourceRegion} -> ${targetRegion}`);
  }

  const {
    dryRun = false,
    filter = {},
    transform = null,
    batchSize = 100,
  } = options;

  console.log(`🔄 Copying data from ${source.name} to ${target.name}...`);

  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No changes will be made");
  }

  try {
    // Combine source region filter with additional filter
    const sourceFilter = { ...source.filter, ...filter };
    const totalCount = await source.model.countDocuments(sourceFilter);
    console.log(`📊 Found ${totalCount} shops to copy`);

    let copiedCount = 0;
    let errorCount = 0;
    let skip = 0;

    while (skip < totalCount) {
      const shops = await source.model
        .find(sourceFilter)
        .skip(skip)
        .limit(batchSize)
        .lean();

      for (const shop of shops) {
        try {
          // Remove MongoDB-specific fields
          delete shop._id;
          delete shop.__v;

          // Apply transformation if provided
          let transformedShop = shop;
          if (transform && typeof transform === "function") {
            transformedShop = transform(shop);
          }

          // Set the target region
          transformedShop.region = targetRegion;

          if (!dryRun) {
            // Check for existing shop by place_id and target region
            const existing = await target.model.findOne({
              place_id: transformedShop.place_id,
              region: targetRegion,
            });
            if (!existing) {
              await target.model.create(transformedShop);
              copiedCount++;
            }
          } else {
            copiedCount++;
          }
        } catch (error) {
          errorCount++;
          if (errorCount <= 5) {
            console.error(
              `❌ Error copying shop ${shop.name || shop.place_id}:`,
              error.message,
            );
          }
        }
      }

      skip += batchSize;
      console.log(
        `📈 Progress: ${Math.min(skip, totalCount)}/${totalCount} processed`,
      );
    }

    console.log(`✅ Copy completed:`);
    console.log(`   Copied: ${copiedCount}`);
    console.log(`   Errors: ${errorCount}`);

    return { copiedCount, errorCount };
  } catch (error) {
    console.error(`❌ Copy failed:`, error);
    throw error;
  }
}

// Remove duplicates within a region
async function removeDuplicates(regionKey, options = {}) {
  const region = REGIONS[regionKey];
  if (!region) {
    throw new Error(`Unknown region: ${regionKey}`);
  }

  const { dryRun = false, field = "place_id", keepFirst = true } = options;

  console.log(`🔍 Finding duplicates in ${region.name} by ${field}...`);

  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No changes will be made");
  }

  try {
    // Find duplicates within the specific region
    const duplicates = await region.model.aggregate([
      {
        $match: region.filter || {},
      },
      {
        $group: {
          _id: `$${field}`,
          docs: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      {
        $match: { count: { $gt: 1 } },
      },
    ]);

    console.log(`📊 Found ${duplicates.length} duplicate groups`);

    let removedCount = 0;

    for (const duplicate of duplicates) {
      const docsToRemove = keepFirst
        ? duplicate.docs.slice(1)
        : duplicate.docs.slice(0, -1);

      if (!dryRun) {
        const result = await region.model.deleteMany({
          _id: { $in: docsToRemove },
        });
        removedCount += result.deletedCount;
      } else {
        removedCount += docsToRemove.length;
      }
    }

    console.log(
      `✅ Duplicate removal completed: ${removedCount} shops removed`,
    );
    return removedCount;
  } catch (error) {
    console.error(`❌ Duplicate removal failed:`, error);
    throw error;
  }
}

// Update all shops in a region with a transformation
async function updateRegionData(regionKey, updateFunction, options = {}) {
  const region = REGIONS[regionKey];
  if (!region) {
    throw new Error(`Unknown region: ${regionKey}`);
  }

  const { dryRun = false, filter = {}, batchSize = 100 } = options;

  console.log(`🔄 Updating ${region.name} data...`);

  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No changes will be made");
  }

  try {
    // Combine region filter with additional filter
    const regionFilter = { ...region.filter, ...filter };
    const totalCount = await region.model.countDocuments(regionFilter);
    console.log(`📊 Found ${totalCount} shops to update`);

    let updatedCount = 0;
    let errorCount = 0;
    let skip = 0;

    while (skip < totalCount) {
      const shops = await region.model
        .find(regionFilter)
        .skip(skip)
        .limit(batchSize);

      for (const shop of shops) {
        try {
          const updates = updateFunction(shop.toObject());

          if (updates && Object.keys(updates).length > 0) {
            if (!dryRun) {
              await region.model.updateOne({ _id: shop._id }, updates);
            }
            updatedCount++;
          }
        } catch (error) {
          errorCount++;
          if (errorCount <= 5) {
            console.error(
              `❌ Error updating shop ${shop.name || shop.place_id}:`,
              error.message,
            );
          }
        }
      }

      skip += batchSize;
      console.log(
        `📈 Progress: ${Math.min(skip, totalCount)}/${totalCount} processed`,
      );
    }

    console.log(`✅ Update completed:`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Errors: ${errorCount}`);

    return { updatedCount, errorCount };
  } catch (error) {
    console.error(`❌ Update failed:`, error);
    throw error;
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    showUsage();
    return;
  }

  await connectDB();

  try {
    switch (command) {
      case "backup":
        {
          const region = args[1];
          const outputPath =
            args[2] || `./backups/${region}-${Date.now()}.json`;

          if (!region || !REGIONS[region]) {
            console.error("❌ Please specify a valid region");
            return;
          }

          await backupRegion(region, outputPath);
        }
        break;

      case "restore":
        {
          const region = args[1];
          const inputPath = args[2];
          const dryRun = args.includes("--dry-run");
          const clearExisting = args.includes("--clear");

          if (!region || !inputPath || !REGIONS[region]) {
            console.error("❌ Please specify a valid region and input file");
            return;
          }

          await restoreRegion(region, inputPath, { dryRun, clearExisting });
        }
        break;

      case "copy":
        {
          const sourceRegion = args[1];
          const targetRegion = args[2];
          const dryRun = args.includes("--dry-run");

          if (
            !sourceRegion ||
            !targetRegion ||
            !REGIONS[sourceRegion] ||
            !REGIONS[targetRegion]
          ) {
            console.error("❌ Please specify valid source and target regions");
            return;
          }

          await copyRegionData(sourceRegion, targetRegion, { dryRun });
        }
        break;

      case "remove-duplicates":
        {
          const region = args[1];
          const field = args[2] || "place_id";
          const dryRun = args.includes("--dry-run");

          if (!region || !REGIONS[region]) {
            console.error("❌ Please specify a valid region");
            return;
          }

          await removeDuplicates(region, { dryRun, field });
        }
        break;

      case "update":
        {
          const region = args[1];
          const dryRun = args.includes("--dry-run");

          if (!region || !REGIONS[region]) {
            console.error("❌ Please specify a valid region");
            return;
          }

          // Example update function - normalize phone numbers
          const updateFunction = (shop) => {
            const updates = {};

            // Normalize phone numbers
            if (shop.phone && typeof shop.phone === "string") {
              const normalized = shop.phone.replace(/[^\d]/g, "");
              if (normalized.length === 10) {
                updates.phone = `+1${normalized}`;
              }
            }

            // Add any other transformations here

            return updates;
          };

          await updateRegionData(region, updateFunction, { dryRun });
        }
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        showUsage();
    }

    console.log("\n✅ Migration operation complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
}

// Show usage information
function showUsage() {
  console.log(`
🔄 Data Migration Tool

Usage:
  node data-migration.js <command> [options]

Commands:
  backup <region> [output_path]           Backup region data to JSON file
  restore <region> <input_path> [options] Restore region data from JSON file
  copy <source_region> <target_region>    Copy data between regions
  remove-duplicates <region> [field]      Remove duplicate entries
  update <region>                         Update/transform region data

Regions:
  colorado, michigan, canada, jamaica, usvirginislands

Options:
  --dry-run        Show what would be done without making changes
  --clear          Clear existing data before restore (use with caution!)

Examples:
  # Backup Colorado data
  node data-migration.js backup colorado ./backups/colorado-backup.json
  
  # Restore Michigan data (dry run first)
  node data-migration.js restore michigan ./backups/michigan-backup.json --dry-run
  node data-migration.js restore michigan ./backups/michigan-backup.json
  
  # Copy data from Colorado to Michigan
  node data-migration.js copy colorado michigan --dry-run
  
  # Remove duplicates by place_id
  node data-migration.js remove-duplicates colorado place_id --dry-run
  
  # Update/normalize data
  node data-migration.js update colorado --dry-run

⚠️  IMPORTANT: Always use --dry-run first to preview changes!
`);
}

// Handle help flag
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showUsage();
  process.exit(0);
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  backupRegion,
  restoreRegion,
  copyRegionData,
  removeDuplicates,
  updateRegionData,
  REGIONS,
};
