const Region = require("../models/region");

/**
 * Get all active regions
 */
async function getAllRegions(req, res) {
  try {
    const regions = await Region.find({ isActive: true })
      .select("-__v")
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      regions,
      count: regions.length,
    });
  } catch (error) {
    console.error("Error fetching regions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch regions",
      details: error.message,
    });
  }
}

/**
 * Get a specific region by ID or code
 */
async function getRegion(req, res) {
  try {
    const { identifier } = req.params;

    // Try to find by ID first, then by code
    let region = await Region.findById(identifier).lean();
    if (!region) {
      region = await Region.findOne({
        code: identifier.toUpperCase(),
        isActive: true,
      }).lean();
    }

    if (!region) {
      return res.status(404).json({
        success: false,
        error: "Region not found",
      });
    }

    res.json({
      success: true,
      region,
    });
  } catch (error) {
    console.error("Error fetching region:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch region",
      details: error.message,
    });
  }
}

/**
 * Detect region based on user coordinates
 */
async function detectRegion(req, res) {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: "Latitude and longitude are required",
        example: "/api/regions/detect?lat=39.7392&lng=-104.9903",
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: "Invalid latitude or longitude values",
      });
    }

    // Validate coordinate ranges
    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        error: "Coordinates out of valid range",
      });
    }

    const region = await Region.findByCoordinates(latitude, longitude);

    if (!region) {
      return res.json({
        success: true,
        region: null,
        message: "No region found for the provided coordinates",
        coordinates: { lat: latitude, lng: longitude },
      });
    }

    res.json({
      success: true,
      region: {
        id: region._id,
        name: region.name,
        code: region.code,
        country: region.country,
        shopCollection: region.shopCollection,
        defaultSearchRadius: region.defaultSearchRadius,
        maxSearchRadius: region.maxSearchRadius,
        center: region.center,
      },
      coordinates: { lat: latitude, lng: longitude },
      message: `Location detected in ${region.name}`,
    });
  } catch (error) {
    console.error("Error detecting region:", error);
    res.status(500).json({
      success: false,
      error: "Failed to detect region",
      details: error.message,
    });
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get nearby regions within a specified radius
 */
async function getNearbyRegions(req, res) {
  try {
    const { lat, lng, radius = 500 } = req.query; // Default 500km radius

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: "Latitude and longitude are required",
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const searchRadius = parseFloat(radius);

    if (isNaN(latitude) || isNaN(longitude) || isNaN(searchRadius)) {
      return res.status(400).json({
        success: false,
        error: "Invalid coordinate or radius values",
      });
    }

    const regions = await Region.find({ isActive: true }).lean();

    const nearbyRegions = regions
      .map((region) => {
        const distance = calculateDistance(
          latitude,
          longitude,
          region.center.lat,
          region.center.lng,
        );
        return { ...region, distance };
      })
      .filter((region) => region.distance <= searchRadius)
      .sort((a, b) => a.distance - b.distance);

    res.json({
      success: true,
      regions: nearbyRegions,
      count: nearbyRegions.length,
      searchCriteria: {
        coordinates: { lat: latitude, lng: longitude },
        radius: searchRadius,
      },
    });
  } catch (error) {
    console.error("Error finding nearby regions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to find nearby regions",
      details: error.message,
    });
  }
}

/**
 * Create a new region (admin function)
 */
async function createRegion(req, res) {
  try {
    const regionData = req.body;

    // Validate required fields
    const requiredFields = [
      "name",
      "code",
      "country",
      "boundaries",
      "center",
      "shopCollection",
    ];
    const missingFields = requiredFields.filter((field) => !regionData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        missingFields,
      });
    }

    const region = new Region(regionData);
    await region.save();

    res.status(201).json({
      success: true,
      region,
      message: "Region created successfully",
    });
  } catch (error) {
    console.error("Error creating region:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: "Region with this name or code already exists",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to create region",
      details: error.message,
    });
  }
}

/**
 * Update a region (admin function)
 */
async function updateRegion(req, res) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const region = await Region.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!region) {
      return res.status(404).json({
        success: false,
        error: "Region not found",
      });
    }

    res.json({
      success: true,
      region,
      message: "Region updated successfully",
    });
  } catch (error) {
    console.error("Error updating region:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update region",
      details: error.message,
    });
  }
}

module.exports = {
  getAllRegions,
  getRegion,
  detectRegion,
  getNearbyRegions,
  createRegion,
  updateRegion,
  calculateDistance,
};
