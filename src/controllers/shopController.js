const LicenseRecord = require("../models/licenseRecord");

// --- Classify cannabis shop as medical or recreational ---
function classifyCannabisType(shop) {
  // Only classify if it's actually a cannabis shop (not a smoke shop)
  if (shop.smoke_shop === true) {
    return null; // Not a cannabis shop
  }

  // Combine all searchable fields
  const searchableText = [
    shop.business_name,
    shop.type,
    shop.category,
    shop.owner_title,
    ...(shop.subtypes || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Medical keywords (priority check first)
  const medicalKeywords = [
    "medical",
    "medicinal",
    "med card",
    "cannabis card",
    "mmj",
    "medical marijuana",
    "certification",
    "doctor",
    "clinic",
    "physician",
    "evaluation",
    "recommendation",
    "patient",
    "prescription",
    "healthcare",
    "treatment center",
  ];

  // Recreational keywords
  const recreationalKeywords = [
    "recreational",
    "adult use",
    "adult-use",
    "rec ",
    "21+",
    "dispensary",
    "retail",
  ];

  // Check for medical indicators
  const isMedical = medicalKeywords.some((keyword) =>
    searchableText.includes(keyword),
  );

  // Check for recreational indicators
  const isRecreational = recreationalKeywords.some((keyword) =>
    searchableText.includes(keyword),
  );

  // Determine classification
  if (isMedical && isRecreational) {
    return "both"; // Dual license
  } else if (isMedical) {
    return "medical";
  } else if (isRecreational) {
    return "recreational";
  } else {
    // Default: most cannabis stores without explicit keywords are recreational
    // unless they have "clinic" or similar in the type
    if (
      searchableText.includes("clinic") ||
      searchableText.includes("treatment")
    ) {
      return "medical";
    }
    return "recreational"; // Default assumption
  }
}

// --- Build MongoDB query for direct country/state/city filtering (NO geocoding) ---
function buildDirectFilterQuery(country, state, city, filters) {
  const query = {};

  // Priority: City > State > Country
  if (city) {
    query.city = {
      $regex: new RegExp(`^${city}$`, "i"),
      $ne: null,
      $exists: true,
    };
  }

  if (state) {
    query.stateName = {
      $regex: new RegExp(`^${state}$`, "i"),
      $ne: null,
      $exists: true,
    };
  }

  if (country) {
    query.country_code = {
      $regex: new RegExp(`^${country}$`, "i"),
      $ne: null,
      $exists: true,
    };
  }

  // Add other filters
  if (filters.smokeShop !== undefined) {
    query.smoke_shop = filters.smokeShop;
  }
  if (filters.cannabis !== undefined) {
    query.smoke_shop = filters.cannabis ? false : true;
  }
  if (filters.canojaVerified !== undefined) {
    query.canojaVerified = filters.canojaVerified;
  }
  if (filters.featured !== undefined) {
    query.featured = filters.featured;
  }
  if (filters.verified !== undefined) {
    query.verified = filters.verified;
  }
  if (filters.businessStatus) {
    query.business_status = new RegExp(filters.businessStatus, "i");
  }
  if (filters.category) {
    query.category = new RegExp(filters.category, "i");
  }
  if (filters.minRating) {
    query.rating = { $gte: parseFloat(filters.minRating) };
  }
  if (filters.licenseStatus) {
    query.license_status = new RegExp(filters.licenseStatus, "i");
  }
  if (filters.operatorType) {
    // Add operator type matching logic if needed
    const licenseTypeRegex = new RegExp(filters.operatorType, "i");
    query.license_type = licenseTypeRegex;
  }
  if (filters.medical !== undefined) {
    query.license_type = new RegExp("medical", "i");
  }

  console.log(`Direct filter query built:`, JSON.stringify(query));
  return query;
}

// --- Haversine Distance (meters) ---
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

// --- Apply filters to shop results ---
function applySearchFilters(shops, filters) {
  if (!filters || Object.keys(filters).length === 0) {
    return shops;
  }

  return shops.filter((shop) => {
    // Cannoja Verified
    if (filters.cannojaVerified) {
      if (!shop.canojaVerified) {
        return false;
      }
    }

    if (filters.country) {
      if (shop.country_code?.toLowerCase() !== filters.country.toLowerCase()) {
        return false;
      }
    }

    // License Status filter
    if (filters.licenseStatus) {
      if (
        shop.license_status?.toLowerCase() !==
        filters.licenseStatus.toLowerCase()
      ) {
        return false;
      }
    }

    // Operator Type - match against license type
    if (filters.operatorType) {
      const licenseType = (shop.license_type || "").toLowerCase();
      const operatorType = filters.operatorType.toLowerCase();

      const typeMapping = {
        "adult use retail dispensary": [
          "retail",
          "dispensary",
          "adult",
          "recreational",
        ],
        "medical marijuana dispensary": ["medical", "dispensary"],
        "medical marijuana treatment center": [
          "medical",
          "treatment",
          "center",
        ],
        "mmj operator": ["medical", "mmj"],
        "rmj operator": ["retail", "recreational", "adult", "rmj"],
      };

      const keywords = typeMapping[operatorType] || [operatorType];
      const matches = keywords.some((kw) => licenseType.includes(kw));

      if (!matches) return false;
    }

    // Medical filter
    if (filters.medical) {
      const licenseType = (shop.license_type || "").toLowerCase();
      if (!licenseType.includes("medical")) return false;
    }

    // Smoke Shop filter
    if (filters.smokeShop) {
      if (!shop.smoke_shop) return false;
    }

    // State filter
    if (filters.state) {
      if (shop.stateName?.toLowerCase() !== filters.state.toLowerCase()) {
        return false;
      }
    }

    // City filter
    if (filters.city) {
      if (shop.city?.toLowerCase() !== filters.city.toLowerCase()) {
        return false;
      }
    }

    // Business Status filter (OPERATIONAL, CLOSED_TEMPORARILY, etc.)
    if (filters.businessStatus) {
      if (
        shop.business_status?.toLowerCase() !==
        filters.businessStatus.toLowerCase()
      ) {
        return false;
      }
    }

    // Minimum Rating filter
    if (filters.minRating) {
      const minRating = parseFloat(filters.minRating);
      if (!shop.rating || shop.rating < minRating) {
        return false;
      }
    }

    // Category filter
    if (filters.category) {
      if (shop.category?.toLowerCase() !== filters.category.toLowerCase()) {
        return false;
      }
    }

    // Featured filter
    if (filters.featured && !shop.featured) {
      return false;
    }

    // Verified (Google) filter
    if (filters.verified && !shop.verified) {
      return false;
    }

    // ADD THIS: Open Now filter
    if (filters.openNow === true) {
      // Only keep shops that are explicitly open
      if (shop.open_now !== true) {
        return false;
      }
    }

    if (filters.openNow === false) {
      // Only keep shops that are explicitly closed
      if (shop.open_now === true) {
        return false;
      }
    }

    // Favorites - array of IDs
    if (
      filters.favorites &&
      Array.isArray(filters.favorites) &&
      filters.favorites.length > 0
    ) {
      if (!filters.favorites.includes(shop._id.toString())) {
        return false;
      }
    }

    return true;
  });
}

// --- Build MongoDB query for location-based search ---
function buildLocationQuery(lat, lng, radius, filters) {
  const query = {
    location: {
      $geoWithin: {
        $centerSphere: [[lng, lat], radius / 6378100],
      },
    },
  };

  // Add filters that can be done at DB level
  if (filters.country) {
    query.country_code = {
      $regex: new RegExp(`^${filters.country}$`, "i"),
      $ne: null,
      $exists: true,
    };
  }
  if (filters.state) {
    query.stateName = {
      $regex: new RegExp(`^${filters.state}$`, "i"),
      $ne: null,
      $exists: true,
    };
  }
  if (filters.city) {
    query.city = {
      $regex: new RegExp(`^${filters.city}$`, "i"),
      $ne: null,
      $exists: true,
    };
  }
  if (filters.smokeShop !== undefined) {
    query.smoke_shop = filters.smokeShop;
  }
  if (filters.cannabis !== undefined) {
    query.smoke_shop = filters.cannabis ? false : true;
  }
  if (filters.canojaVerified !== undefined) {
    query.canojaVerified = filters.canojaVerified;
  }
  if (filters.featured !== undefined) {
    query.featured = filters.featured;
  }
  if (filters.verified !== undefined) {
    query.verified = filters.verified;
  }
  if (filters.businessStatus) {
    query.business_status = new RegExp(filters.businessStatus, "i");
  }
  if (filters.category) {
    query.category = new RegExp(filters.category, "i");
  }
  if (filters.minRating) {
    query.rating = { $gte: parseFloat(filters.minRating) };
  }

  return query;
}

// --- Build MongoDB query for keyword search ---
function buildKeywordQuery(keyword, filters) {
  const searchConditions = [];

  // Text search on multiple fields
  const keywordRegex = new RegExp(keyword, "i");

  searchConditions.push({
    $or: [
      { business_name: keywordRegex },
      // { dba: keywordRegex },
      // { business_address: keywordRegex },
      // { city: keywordRegex },
      // { license_number: keywordRegex },
      // { category: keywordRegex },
      // { description: keywordRegex },
    ],
  });

  // Add base filters
  if (filters.country) {
    searchConditions.push({
      country_code: {
        $regex: new RegExp(`^${filters.country}$`, "i"),
        $ne: null,
        $exists: true,
      },
    });
  }
  if (filters.state) {
    searchConditions.push({
      stateName: {
        $regex: new RegExp(`^${filters.state}$`, "i"),
        $ne: null,
        $exists: true,
      },
    });
  }
  if (filters.city) {
    searchConditions.push({
      city: {
        $regex: new RegExp(`^${filters.city}$`, "i"),
        $ne: null,
        $exists: true,
      },
    });
  }
  if (filters.smokeShop !== undefined) {
    searchConditions.push({ smoke_shop: filters.smokeShop });
  }
  if (filters.cannabis !== undefined) {
    searchConditions.push({
      smoke_shop: filters.cannabis ? false : true,
    });
  }
  if (filters.canojaVerified !== undefined) {
    searchConditions.push({ canojaVerified: filters.canojaVerified });
  }
  if (filters.featured !== undefined) {
    searchConditions.push({ featured: filters.featured });
  }
  if (filters.verified !== undefined) {
    searchConditions.push({ verified: filters.verified });
  }
  if (filters.businessStatus) {
    searchConditions.push({
      business_status: new RegExp(filters.businessStatus, "i"),
    });
  }
  if (filters.category) {
    searchConditions.push({ category: new RegExp(filters.category, "i") });
  }
  if (filters.minRating) {
    searchConditions.push({ rating: { $gte: parseFloat(filters.minRating) } });
  }

  return searchConditions.length > 0 ? { $and: searchConditions } : {};
}

function isShopOpenNow(shop) {
  // If permanently closed, definitely not open
  if (shop.business_status === "PERMANENTLY_CLOSED") {
    return false;
  }

  // If temporarily closed, not open
  if (shop.business_status === "CLOSED_TEMPORARILY") {
    return false;
  }

  // If no working hours available
  if (!shop.working_hours || Object.keys(shop.working_hours).length === 0) {
    if (shop.business_status === "OPERATIONAL") {
      return null; // Unknown - operational but no hours
    }
    return false;
  }

  // Get current time in shop's timezone (or default to US Eastern)
  const timeZone = shop.time_zone || "America/New_York";
  const now = new Date();

  // Get current day and time in shop's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const dayName = parts.find((p) => p.type === "weekday").value;
  const hour = parseInt(parts.find((p) => p.type === "hour").value);
  const minute = parseInt(parts.find((p) => p.type === "minute").value);
  const currentMinutes = hour * 60 + minute;

  // Get today's hours
  const todayHours = shop.working_hours[dayName];

  if (!todayHours) {
    return false; // No hours for today means closed
  }

  // ADD THIS: Check for "Open 24 hours" case
  if (todayHours.toLowerCase().includes("open 24 hours")) {
    return true;
  }

  // Check for "Closed" day
  if (todayHours.toLowerCase().includes("closed")) {
    return false;
  }

  // Parse hours like "10a.m.-10p.m." or "12-10p.m."
  const hoursMatch = todayHours.match(
    /(\d+)(a\.m\.|p\.m\.)?-(\d+)(a\.m\.|p\.m\.)/i,
  );

  if (!hoursMatch) {
    return null; // Can't parse, unknown
  }

  let openHour = parseInt(hoursMatch[1]);
  const openPeriod = hoursMatch[2];
  let closeHour = parseInt(hoursMatch[3]);
  const closePeriod = hoursMatch[4];

  // Convert to 24-hour format
  if (openPeriod && openPeriod.toLowerCase().includes("p") && openHour !== 12) {
    openHour += 12;
  }
  if (openPeriod && openPeriod.toLowerCase().includes("a") && openHour === 12) {
    openHour = 0;
  }

  if (
    closePeriod &&
    closePeriod.toLowerCase().includes("p") &&
    closeHour !== 12
  ) {
    closeHour += 12;
  }
  if (
    closePeriod &&
    closePeriod.toLowerCase().includes("a") &&
    closeHour === 12
  ) {
    closeHour = 0;
  }

  const openMinutes = openHour * 60;
  const closeMinutes = closeHour * 60;

  // Handle overnight hours (e.g., 10pm - 2am)
  if (closeMinutes < openMinutes) {
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

// --- Format shop data for response (WITH BACKWARD COMPATIBILITY) ---
function formatShopData(record, userLat = null, userLng = null) {
  const [lng, lat] = record.location?.coordinates || [null, null];

  // Calculate distance if user location provided
  let distance = null;
  let distanceMeters = null;
  if (userLat && userLng && lat && lng) {
    distanceMeters = haversineDistance(userLat, userLng, lat, lng);
    distance = `${Math.round(distanceMeters)}m`;
  }

  const openNowStatus = isShopOpenNow(record);

  const cannabisType = classifyCannabisType(record);

  return {
    // IDs
    _id: record._id,
    place_id: record.place_id || record.googlePlaceId,
    google_id: record.google_id,
    cid: record.cid,
    kgmid: record.kgmid,

    // Basic Info
    name: record.business_name,
    dba: record.dba,
    type: record.type,
    subtypes: record.subtypes || [],
    types: record.subtypes || [], // BACKWARD COMPATIBLE (old name)
    category: record.category,

    // Location
    address: record.business_address,
    street: record.street,
    city: record.city,
    borough: record.borough,
    stateName: record.stateName,
    postal_code: record.postal_code,
    country: record.country,
    country_code: record.country_code,
    lat: lat,
    lng: lng,
    distance: distance,
    distanceMeters: distanceMeters,
    time_zone: record.time_zone,
    plus_code: record.plus_code,

    // Parent Location
    located_in: record.located_in,
    located_google_id: record.located_google_id,

    // License Information
    license_number: record.license_number,
    license_status: record.license_status,
    license_type: record.license_type,
    issue_date: record.issue_date,
    expiration_date: record.expiration_date,
    jurisdiction: record.jurisdiction,
    regulatory_body: record.regulatory_body,
    entity_type: record.entity_type,

    // Contact Information
    phone: record.contact_information?.phone,
    email: record.contact_information?.email,
    website: record.contact_information?.website,
    domain: record.contact_information?.domain,
    email_1: record.email_1,
    email_2: record.email_2,

    // Reviews & Ratings
    rating: record.rating,
    reviews: record.reviews,
    user_ratings_total: record.reviews, // BACKWARD COMPATIBLE (old name)
    reviews_link: record.reviews_link,
    reviews_per_score: record.reviews_per_score,
    reviews_tags: record.reviews_tags || [],

    // Photos - WITH BACKWARD COMPATIBILITY
    photo: record.photo,
    photo_url: record.photo, // BACKWARD COMPATIBLE (old name)
    street_view: record.street_view,
    photos_count: record.photos_count,
    photos: record.photo
      ? [
          {
            // BACKWARD COMPATIBLE (old format)
            photo_url: record.photo,
            photo_reference: null,
            height: null,
            width: null,
          },
        ]
      : [],

    // Business Hours & Status - WITH BACKWARD COMPATIBILITY
    working_hours: record.working_hours,
    working_hours_csv: record.working_hours_csv_compat,
    popular_times: record.popular_times,
    business_status: record.business_status,
    opening_hours: record.working_hours
      ? {
          open_now: openNowStatus,
          periods: [],
          weekday_text: [],
        }
      : null,
    open_now: openNowStatus,

    // Business Details
    about: record.about,
    range: record.range,
    price_level: record.range
      ? record.range.includes("$$$")
        ? 3
        : record.range.includes("$$")
          ? 2
          : 1
      : null, // BACKWARD COMPATIBLE
    description: record.description,
    posts: record.posts,
    verified: record.verified || false,
    area_service: record.area_service || false,

    // Links
    location_link: record.location_link,
    reservation_links: record.reservation_links,
    booking_appointment_link: record.booking_appointment_link,
    menu_link: record.menu_link,
    order_links: record.order_links,

    // Owner (Google Maps)
    owner_id: record.owner_id,
    owner_title: record.owner_title,
    owner_link: record.owner_link,

    // License Owner
    owner: record.owner,
    operator_name: record.operator_name,

    // Verification Status
    canojaVerified: record.canojaVerified || false,
    claimed: record.claimed || false,
    featured: record.featured || false,
    adminVerificationRequired: record.adminVerificationRequired || false,
    isMatched: record.canojaVerified || false, // BACKWARD COMPATIBLE
    matchedLicense: record.canojaVerified
      ? {
          // BACKWARD COMPATIBLE
          business_name: record.business_name,
          license_number: record.license_number,
          license_status: record.license_status,
          license_type: record.license_type,
          address: record.business_address,
          city: record.city,
          stateName: record.stateName,
          dba: record.dba,
        }
      : null,

    // Documents
    state_license_document: record.state_license_document,
    utility_bill: record.utility_bill,
    gps_validation: record.gps_validation,

    // Classification
    smoke_shop: record.smoke_shop || false,
    cannabis_type: cannabisType,

    // Metadata
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// --- Geocode address using OpenStreetMap ---
async function geocodeAddress(state, city, zip, country = "US") {
  try {
    const axios = require("axios");
    let addressString = "";
    if (city) addressString += city;
    if (state) addressString += (addressString ? ", " : "") + state;
    if (zip) addressString += (addressString ? ", " : "") + zip;
    if (country) addressString += (addressString ? ", " : "") + country;

    if (!addressString) {
      throw new Error(
        "At least one of state, city, or zip code must be provided",
      );
    }

    console.log(`Geocoding address with OpenStreetMap: ${addressString}`);

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressString)}&format=json&limit=1`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Canoja/1.0 (muhammadahmad2493@gmail.com)",
      },
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);

      console.log(`Geocoding successful: ${result.display_name}`);
      console.log(`Coordinates: lat=${lat}, lng=${lng}`);

      return {
        lat: lat,
        lng: lng,
        formatted_address: result.display_name,
        success: true,
      };
    } else {
      throw new Error("No results found for the provided address");
    }
  } catch (error) {
    console.error("Geocoding error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// --- Determine radius for zip code geocoding ---
function determineRadius(providedRadius) {
  if (providedRadius) {
    console.log(`Using provided radius: ${providedRadius}m`);
    return parseInt(providedRadius);
  }

  console.log(`Using default radius for zip code: 6km`);
  return 6000;
}

// --- MAIN ENDPOINT: Search Shops ---
async function compareShops(req, res) {
  try {
    let lat, lng, finalRadius;
    const {
      radius,
      state,
      city,
      zipCode,
      country,
      filters = {},
      keyword = null,
      page = 1,
      limit = 10,
    } = req.body;

    const isKeywordSearch = keyword && keyword.trim().length >= 1;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    console.log(
      `\n=== Starting ${isKeywordSearch ? "KEYWORD" : "LOCATION-BASED"} search ===`,
    );
    if (isKeywordSearch) console.log(`Keyword: "${keyword}"`);
    console.log(`Filters:`, JSON.stringify(filters));
    console.log(`Pagination: page=${pageNum}, limit=${limitNum}`);

    let query = {};
    let shops = [];
    let totalCount = 0;

    if (isKeywordSearch) {
      // ===== KEYWORD SEARCH MODE =====
      console.log(`Building keyword search query...`);
      query = buildKeywordQuery(keyword, filters);

      totalCount = await LicenseRecord.countDocuments(query);

      shops = await LicenseRecord.find(query)
        .skip(skip)
        .limit(limitNum)
        .sort({ business_name: 1 })
        .lean();

      console.log(
        `Found ${totalCount} total shops matching keyword "${keyword}"`,
      );
      console.log(`Returning ${shops.length} shops for page ${pageNum}`);
    } else {
      // ===== LOCATION-BASED SEARCH MODE =====

      if (req.body.lat && req.body.lng) {
        // Direct coordinates provided
        lat = parseFloat(req.body.lat);
        lng = parseFloat(req.body.lng);
        finalRadius = radius ? parseInt(radius) : 5000;

        console.log(
          `Using provided coordinates: lat=${lat}, lng=${lng}, radius=${finalRadius}m`,
        );
        query = buildLocationQuery(lat, lng, finalRadius, filters);

        totalCount = await LicenseRecord.countDocuments(query);
        const allShopsInRadius = await LicenseRecord.find(query).lean();

        let shopsWithDistance = allShopsInRadius.map((shop) =>
          formatShopData(shop, lat, lng),
        );

        shopsWithDistance.sort((a, b) => {
          if (a.distanceMeters === null) return 1;
          if (b.distanceMeters === null) return -1;
          return a.distanceMeters - b.distanceMeters;
        });

        shopsWithDistance = applySearchFilters(shopsWithDistance, filters);
        totalCount = shopsWithDistance.length;
        shops = shopsWithDistance.slice(skip, skip + limitNum);
      } else if (zipCode || radius) {
        // Zip code OR radius requires geocoding
        finalRadius = radius ? parseInt(radius) : 6000;
        const geocodeResult = await geocodeAddress(
          state,
          city,
          zipCode,
          country,
        );

        if (!geocodeResult.success) {
          return res.status(400).json({
            success: false,
            error: "Failed to geocode address for radius-based search",
          });
        }

        lat = geocodeResult.lat;
        lng = geocodeResult.lng;

        console.log(
          `Geocoded address: lat=${lat}, lng=${lng}, radius=${finalRadius}m`,
        );
        query = buildLocationQuery(lat, lng, finalRadius, filters);

        totalCount = await LicenseRecord.countDocuments(query);
        const allShopsInRadius = await LicenseRecord.find(query).lean();

        let shopsWithDistance = allShopsInRadius.map((shop) =>
          formatShopData(shop, lat, lng),
        );

        shopsWithDistance.sort((a, b) => {
          if (a.distanceMeters === null) return 1;
          if (b.distanceMeters === null) return -1;
          return a.distanceMeters - b.distanceMeters;
        });

        shopsWithDistance = applySearchFilters(shopsWithDistance, filters);
        totalCount = shopsWithDistance.length;
        shops = shopsWithDistance.slice(skip, skip + limitNum);
      } else if (country || state || city) {
        // NEW: Direct database filtering by country/state/city (no geocoding, no radius)
        console.log(
          `Using direct database filtering: country=${country}, state=${state}, city=${city}`,
        );
        query = buildDirectFilterQuery(country, state, city, filters);

        // Get all matching shops
        const allShops = await LicenseRecord.find(query)
          .sort({ business_name: 1 })
          .lean();

        console.log(`Found ${allShops.length} shops matching direct filter`);

        // Geocode the location for response display (not for filtering)
        const geocodeResult = await geocodeAddress(state, city, null, country);
        if (geocodeResult.success) {
          lat = geocodeResult.lat;
          lng = geocodeResult.lng;
          console.log(`Geocoded location for response: lat=${lat}, lng=${lng}`);
        } else {
          console.log(`Could not geocode location for response display`);
        }

        // FORMAT EACH SHOP (this adds photo_url, photos array, etc.)
        let formattedShops = allShops.map((shop) => formatShopData(shop));

        // Apply in-memory filters (openNow, operatorType, etc.)
        formattedShops = applySearchFilters(formattedShops, filters);

        totalCount = formattedShops.length;

        // Paginate AFTER filtering
        shops = formattedShops.slice(skip, skip + limitNum);

        console.log(`Shops after filtering: ${totalCount}`);
        console.log(`Returning ${shops.length} shops for page ${pageNum}`);
      } else {
        return res.status(400).json({
          success: false,
          error:
            "Location required: provide lat/lng, zipCode, or country/state/city",
        });
      }

      console.log(`Shops after filtering: ${totalCount}`);
      console.log(`Returning ${shops.length} shops for page ${pageNum}`);
    }

    // IMPORTANT: For keyword search, still need to format
    let formattedShops = isKeywordSearch
      ? shops.map((shop) => formatShopData(shop, lat, lng))
      : shops; // Already formatted for location-based searches

    if (isKeywordSearch) {
      formattedShops = applySearchFilters(formattedShops, filters);
      // totalCount = formattedShops.length;
    }
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasMore = pageNum < totalPages;

    const licensedShops = formattedShops.filter(
      (shop) => shop.canojaVerified === true,
    );
    const unlicensedShops = formattedShops.filter(
      (shop) => shop.canojaVerified !== true,
    );

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total shops found: ${totalCount}`);
    console.log(`Shops returned (after filters): ${formattedShops.length}`);
    console.log(`Licensed (verified): ${licensedShops.length}`);
    console.log(`Unlicensed/Pending: ${unlicensedShops.length}`);
    console.log(`Current page: ${pageNum}/${totalPages}`);
    console.log(`Has more: ${hasMore}`);

    const medicalShops = formattedShops.filter(
      (s) => s.cannabis_type === "medical",
    );
    const recreationalShops = formattedShops.filter(
      (s) => s.cannabis_type === "recreational",
    );
    const bothShops = formattedShops.filter((s) => s.cannabis_type === "both");
    const smokeShops = formattedShops.filter((s) => s.smoke_shop === true);

    res.json({
      success: true,
      data: {
        shops: formattedShops,
        licensed_shops: licensedShops,
        unlicensed_shops: unlicensedShops,

        pagination: {
          current_page: pageNum,
          total_pages: totalPages,
          total_results: totalCount,
          results_per_page: limitNum,
          results_on_page: formattedShops.length,
          has_more: hasMore,
        },

        search_info: {
          search_type: isKeywordSearch ? "keyword" : "location",
          keyword: isKeywordSearch ? keyword : null,
          location: !isKeywordSearch ? { lat, lng, radius: finalRadius } : null,
          geocoded_location:
            !isKeywordSearch && lat && lng
              ? {
                  lat,
                  lng,
                  city: city || null,
                  state: state || null,
                  country: country || null,
                }
              : null,
          filters_applied: filters,
        },

        stats: {
          total_found: totalCount,
          licensed_count: licensedShops.length,
          unlicensed_count: unlicensedShops.length,
          medical_count: medicalShops.length,
          recreational_count: recreationalShops.length,
          both_count: bothShops.length,
          smoke_shop_count: smokeShops.length,
        },

        debug: {
          query_type: isKeywordSearch ? "keyword" : "geospatial",
          mongodb_query: query,
          filters_applied: filters,
        },
      },
    });
  } catch (error) {
    console.error("Error in search:", error);
    res.status(500).json({
      success: false,
      error: "Search failed",
      details: error.message,
    });
  }
}

// --- Get More Shops (pagination) ---
async function getMoreShops(req, res) {
  try {
    const { page = 2, limit = 20 } = req.body;
    req.body.page = page;
    return await compareShops(req, res);
  } catch (error) {
    console.error("Error getting more shops:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get more shops",
      details: error.message,
    });
  }
}

// --- Clear pagination/session ---
async function clearPaginationTokens(req, res) {
  try {
    res.json({
      success: true,
      message: "All sessions cleared (pagination is now stateless)",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// --- Get search session status ---
async function getSessionStatus(req, res) {
  try {
    res.json({
      success: true,
      message:
        "Sessions are no longer used. Pagination is now stateless using page numbers.",
      data: null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// --- Test database endpoint ---
async function testDatabase(req, res) {
  try {
    const totalCount = await LicenseRecord.countDocuments();
    const withCoordinates = await LicenseRecord.countDocuments({
      "location.coordinates": { $exists: true, $ne: [] },
      "location.coordinates.0": { $exists: true },
      "location.coordinates.1": { $exists: true },
    });
    const verifiedCount = await LicenseRecord.countDocuments({
      canojaVerified: true,
    });
    const smokeShopCount = await LicenseRecord.countDocuments({
      smoke_shop: true,
    });
    const withRatings = await LicenseRecord.countDocuments({
      rating: { $exists: true, $ne: null },
    });
    const withPhotos = await LicenseRecord.countDocuments({
      photo: { $exists: true, $ne: null },
    });

    const sample = await LicenseRecord.findOne({
      "location.coordinates": { $exists: true, $ne: [] },
    });

    // Get stats by state
    const stateStats = await LicenseRecord.aggregate([
      {
        $group: {
          _id: "$stateName",
          count: { $sum: 1 },
          verified: {
            $sum: { $cond: ["$canojaVerified", 1, 0] },
          },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Get stats by category
    const categoryStats = await LicenseRecord.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      success: true,
      data: {
        totalRecords: totalCount,
        recordsWithCoordinates: withCoordinates,
        recordsWithoutCoordinates: totalCount - withCoordinates,
        verifiedRecords: verifiedCount,
        smokeShops: smokeShopCount,
        recordsWithRatings: withRatings,
        recordsWithPhotos: withPhotos,
        verificationRate: `${((verifiedCount / totalCount) * 100).toFixed(1)}%`,
        topStates: stateStats,
        topCategories: categoryStats,
        sampleRecord: sample
          ? {
              business_name: sample.business_name,
              place_id: sample.place_id,
              type: sample.type,
              category: sample.category,
              coordinates: sample.location?.coordinates,
              business_address: sample.business_address,
              city: sample.city,
              stateName: sample.stateName,
              license_status: sample.license_status,
              license_type: sample.license_type,
              rating: sample.rating,
              reviews: sample.reviews,
              business_status: sample.business_status,
              canojaVerified: sample.canojaVerified,
              smoke_shop: sample.smoke_shop,
            }
          : null,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// --- Get shop details by ID ---
async function getShopDetails(req, res) {
  try {
    const { shopId } = req.params;

    if (!shopId) {
      return res.status(400).json({
        success: false,
        error: "Shop ID is required",
      });
    }

    const licenseRecord = await LicenseRecord.findById(shopId);

    if (!licenseRecord) {
      return res.status(404).json({
        success: false,
        error: "Shop not found",
        message: "No license record found with the provided ID",
      });
    }

    const formattedShop = formatShopData(licenseRecord);

    res.json({
      success: true,
      data: formattedShop,
    });
  } catch (error) {
    console.error("Error fetching shop details:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch shop details",
      details: error.message,
    });
  }
}

module.exports = {
  haversineDistance,
  determineRadius,
  geocodeAddress,
  compareShops,
  getMoreShops,
  clearPaginationTokens,
  getSessionStatus,
  testDatabase,
  getShopDetails,
  formatShopData,
  applySearchFilters,
  buildDirectFilterQuery,
  classifyCannabisType,
};
