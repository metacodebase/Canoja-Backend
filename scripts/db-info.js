const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Import all regional shop models
const Shop = require("../src/models/shop");

dotenv.config();

// Define all regions with their models and collection names
const SHOP_MODELS = {
  All_Shops: Shop,
};

const OTHER_MODELS = {
  regions: Region,
};

async function getCollectionStats(collectionName, model = null) {
  try {
    const db = mongoose.connection.db;
    const stats = await db.collection(collectionName).stats();

    let additionalInfo = {};

    if (model) {
      // Get document count and sample data
      const count = await model.countDocuments();
      const sampleDoc = await model.findOne().lean();

      additionalInfo = {
        documentCount: count,
        sampleFields: sampleDoc ? Object.keys(sampleDoc) : [],
        hasIndexes: stats.nindexes > 1, // More than just the default _id index
      };
    }

    return {
      name: collectionName,
      size: stats.size,
      count: stats.count,
      avgObjSize: Math.round(stats.avgObjSize || 0),
      storageSize: stats.storageSize,
      indexes: stats.nindexes,
      indexSize: stats.totalIndexSize,
      ...additionalInfo,
    };
  } catch (error) {
    return {
      name: collectionName,
      error: error.message,
    };
  }
}

async function getDatabaseInfo() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set");
    }

    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const isConnected = mongoose.connection.readyState === 1;
    const dbName = mongoose.connection.name;

    // Get all collections
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    const collectionNames = collections.map((c) => c.name);

    // Get database stats
    const dbStats = await mongoose.connection.db.stats();

    // Get detailed stats for each collection
    const collectionStats = {};

    // Shop collections
    for (const [collectionName, model] of Object.entries(SHOP_MODELS)) {
      if (collectionNames.includes(collectionName)) {
        collectionStats[collectionName] = await getCollectionStats(
          collectionName,
          model,
        );
      }
    }

    // Other known collections
    for (const [collectionName, model] of Object.entries(OTHER_MODELS)) {
      if (collectionNames.includes(collectionName)) {
        collectionStats[collectionName] = await getCollectionStats(
          collectionName,
          model,
        );
      }
    }

    // Unknown collections (without models)
    for (const collectionName of collectionNames) {
      if (!collectionStats[collectionName]) {
        collectionStats[collectionName] =
          await getCollectionStats(collectionName);
      }
    }

    // Calculate totals
    const totalShops = Object.entries(collectionStats)
      .filter(([name]) => name.includes("Shops"))
      .reduce(
        (sum, [, stats]) => sum + (stats.documentCount || stats.count || 0),
        0,
      );

    const totalSize = Object.values(collectionStats).reduce(
      (sum, stats) => sum + (stats.size || 0),
      0,
    );

    return {
      database: {
        connected: isConnected,
        name: dbName,
        totalCollections: collectionNames.length,
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        indexSize: dbStats.indexSize,
        objects: dbStats.objects,
        avgObjSize: Math.round(dbStats.avgObjSize || 0),
        fileSize: dbStats.fileSize || "N/A",
      },
      collections: {
        all: collectionNames,
        shopCollections: Object.keys(SHOP_MODELS).filter((name) =>
          collectionNames.includes(name),
        ),
        otherCollections: collectionNames.filter(
          (name) => !Object.keys(SHOP_MODELS).includes(name),
        ),
      },
      statistics: {
        totalShopsAcrossRegions: totalShops,
        totalDataSize: totalSize,
        shopCollectionCount: Object.keys(SHOP_MODELS).filter((name) =>
          collectionNames.includes(name),
        ).length,
        regionsConfigured: collectionNames.includes("regions")
          ? await Region.countDocuments()
          : "No regions collection found",
      },
      detailedCollectionStats: collectionStats,
      summary: {
        healthStatus: isConnected ? "Connected" : "Disconnected",
        hasAllShopCollections: Object.keys(SHOP_MODELS).every((name) =>
          collectionNames.includes(name),
        ),
        hasRegionsCollection: collectionNames.includes("regions"),
        largestCollection: Object.entries(collectionStats).reduce(
          (largest, [name, stats]) =>
            (stats.documentCount || stats.count || 0) > (largest.count || 0)
              ? { name, count: stats.documentCount || stats.count || 0 }
              : largest,
          { name: "none", count: 0 },
        ),
      },
    };
  } catch (err) {
    throw new Error(`Database connection error: ${err.message}`);
  }
}

(async () => {
  try {
    const dbInfo = await getDatabaseInfo();
    console.log(JSON.stringify(dbInfo, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
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

// Export function for potential use in other scripts
module.exports = {
  getDatabaseInfo,
  getCollectionStats,
  SHOP_MODELS,
  OTHER_MODELS,
};
