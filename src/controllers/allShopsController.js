const Shop = require("../models/shop");

// Ensure unique index on place_id to prevent duplicates
async function ensureUniqueIndex() {
  try {
    await Shop.collection.createIndex({ place_id: 1 }, { unique: true });
  } catch (e) {
    // Index may already exist; log minimally
  }
}

/**
 * Bulk upsert shops into the "All_Shops" collection.
 * Deduplicates by place_id and attaches metadata.
 */
async function saveShops(shops, meta = {}) {
  if (!Array.isArray(shops) || shops.length === 0) {
    return { saved: 0 };
  }

  await ensureUniqueIndex();

  const ops = shops.map((shop) => ({
    updateOne: {
      filter: { place_id: shop.place_id },
      update: {
        $set: {
          name: shop.name,
          address: shop.address,
          city: shop.city, // Parsed city from address
          state: shop.state, // Parsed state abbreviation from address
          stateName: shop.stateName, // Parsed full state name from address
          lat: shop.lat,
          lng: shop.lng,
          place_id: shop.place_id,
          rating: shop.rating,
          user_ratings_total: shop.user_ratings_total,
          price_level: shop.price_level,
          types: shop.types,
          business_status: shop.business_status,
          open_now: shop.open_now,
          opening_hours: shop.opening_hours,
          photo_url: shop.photo_url,
          photos: shop.photos,
          license_status: shop.license_status,
          isMatched: shop.isMatched,
          matchedLicense: shop.matchedLicense
            ? {
                business_name: shop.matchedLicense.business_name,
                license_number: shop.matchedLicense.license_number,
                license_status: shop.matchedLicense.license_status,
                license_type: shop.matchedLicense.license_type,
                address: shop.matchedLicense.business_address,
                city: shop.matchedLicense.city,
                stateName: shop.matchedLicense.stateName,
                dba: shop.matchedLicense.dba,
              }
            : undefined,
          smoke_shop: shop.smoke_shop,
          source: meta.source || "compare-shops",
          session_key: meta.session_key || null,
          current_query: meta.current_query || null,
          coordinates: meta.coordinates || null,
          radius: meta.radius || null,
          fetched_at: new Date(),
        },
      },
      upsert: true,
    },
  }));

  const result = await Shop.bulkWrite(ops, { ordered: false });
  const savedCount =
    (result.upserted || []).length + (result.modifiedCount || 0);
  return { saved: savedCount };
}

// List shops from the "All_Shops" collection with pagination and advanced filters
async function listShops(req, res) {
  try {
    await ensureUniqueIndex();

    const DEFAULT_LIMIT = Math.max(
      1,
      parseInt(process.env.MAX_SHOPS_PER_CALL || "3", 10),
    );
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.max(
      1,
      parseInt(req.query.limit || String(DEFAULT_LIMIT), 10),
    );
    const q = (req.query.q || "").trim();

    // Basic filters
    const filter = {};
    if (q) {
      filter.name = { $regex: q, $options: "i" };
    }
    if (typeof req.query.isMatched !== "undefined") {
      filter.isMatched = req.query.isMatched === "true";
    }
    if (typeof req.query.smoke_shop !== "undefined") {
      filter.smoke_shop = req.query.smoke_shop === "true";
    }
    if (req.query.license_status) {
      filter.license_status = req.query.license_status;
    }

    // Location-based filters (city and state)
    if (req.query.city) {
      filter.city = { $regex: req.query.city, $options: "i" };
    }
    if (req.query.state) {
      // Support both state abbreviation and full state name
      filter.$or = [
        { state: { $regex: req.query.state, $options: "i" } },
        { stateName: { $regex: req.query.state, $options: "i" } },
      ];
    }

    // Radius-based filtering (if lat, lng, and radius are provided)
    let radiusFilter = null;
    let radiusSearchInfo = null;
    if (req.query.lat && req.query.lng && req.query.radius) {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const radius = parseInt(req.query.radius);

      if (!isNaN(lat) && !isNaN(lng) && !isNaN(radius)) {
        // Since shops store lat/lng as separate fields, we'll use $expr with distance calculation
        // This uses the haversine formula to calculate distance in meters
        radiusFilter = {
          $expr: {
            $lte: [
              {
                $multiply: [
                  6371000, // Earth radius in meters
                  {
                    $acos: {
                      $add: [
                        {
                          $multiply: [
                            { $sin: { $degreesToRadians: lat } },
                            { $sin: { $degreesToRadians: "$lat" } },
                          ],
                        },
                        {
                          $multiply: [
                            { $cos: { $degreesToRadians: lat } },
                            { $cos: { $degreesToRadians: "$lat" } },
                            {
                              $cos: {
                                $degreesToRadians: { $subtract: [lng, "$lng"] },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                ],
              },
              radius,
            ],
          },
        };

        // Add radius filter to main filter
        Object.assign(filter, radiusFilter);
        radiusSearchInfo = { lat, lng, radius };
      }
    }

    // Advanced filters object (similar to compareShops)
    let filters = {};
    try {
      if (req.query.filters) {
        filters =
          typeof req.query.filters === "string"
            ? JSON.parse(req.query.filters)
            : req.query.filters;
      }
    } catch (e) {
      console.warn("Invalid filters JSON:", req.query.filters);
    }

    // Apply advanced filters
    if (filters.cannojaVerified) {
      filter.isMatched = true;
      filter.license_status = "active";
    }
    if (typeof filters.openNow !== "undefined") {
      filter.open_now = filters.openNow;
    }
    if (filters.operatorType && filters.operatorType.trim()) {
      filter["matchedLicense.license_type"] = {
        $regex: filters.operatorType,
        $options: "i",
      };
    }
    if (filters.medical) {
      filter["matchedLicense.license_type"] = {
        $regex: "medical",
        $options: "i",
      };
    }
    if (
      filters.favorites &&
      Array.isArray(filters.favorites) &&
      filters.favorites.length > 0
    ) {
      filter.place_id = { $in: filters.favorites };
    }
    if (filters.featured) {
      filter.is_featured = true;
    }

    const total = await Shop.countDocuments(filter);
    const shops = await Shop.find(filter)
      .sort({ fetched_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total_shown = shops.length;
    const has_more = page * limit < total;

    res.json({
      success: true,
      shops,
      pagination: {
        page,
        limit,
        total,
        total_shown,
        has_more,
      },
      filters_applied: {
        q,
        isMatched: filter.isMatched,
        smoke_shop: filter.smoke_shop,
        license_status: filter.license_status,
        city: req.query.city,
        state: req.query.state,
        radius_search: radiusSearchInfo,
        advanced_filters: filters,
      },
      source: "All_Shops",
    });
  } catch (error) {
    console.error("Error listing All shops:", error);
    res
      .status(500)
      .json({
        success: false,
        error: "Failed to list shops",
        details: error.message,
      });
  }
}

module.exports = {
  saveShops,
  listShops,
};
