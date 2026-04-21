const User = require("../models/user");
const VerificationRequest = require("../models/verificationRequest");
const LicenseRecord = require("../models/licenseRecord");
const AuditLog = require("../models/auditLog");
const RequestMessage = require("../models/requestMessage");
const { sendAdminMessageEmail } = require("../utils/emailService");

async function listUsers(req, res) {
  try {
    const users = await User.find({}, "-password -refreshToken").sort({
      createdAt: -1,
    });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

async function toggleUserStatus(req, res) {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId, "-password -refreshToken");
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    if (user.role === "admin") {
      return res
        .status(400)
        .json({ success: false, error: "Cannot deactivate an admin account" });
    }
    const prevActive = user.isActive;
    user.isActive = !user.isActive;
    await user.save();
    await AuditLog.create({
      actor: req.user._id,
      action: "toggle_user_status",
      targetType: "User",
      targetId: user._id,
      before: { isActive: prevActive },
      after: { isActive: user.isActive },
    }).catch(() => {}); // non-blocking
    res.json({
      success: true,
      message: `User ${user.isActive ? "activated" : "deactivated"} successfully`,
      data: { _id: user._id, email: user.email, isActive: user.isActive },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

async function listVerificationHistory(req, res) {
  try {
    const { status, business_type, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (business_type) filter.business_type = business_type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [requests, total] = await Promise.all([
      VerificationRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      VerificationRequest.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── Phase 2 additions ────────────────────────────────────────────────────────
// None of the functions below touch existing routes or data.

// Returns pharmacyIds where the LATEST VerificationRequest matches the given criteria
async function pharmacyIdsByLatestVR(match) {
  const results = await VerificationRequest.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$pharmacyId",
        status: { $first: "$status" },
        method: { $first: "$verification_method" },
      },
    },
    { $match: match },
  ]);
  return results.map((r) => r._id);
}

// GET /api/admin/retailers
async function listRetailers(req, res) {
  try {
    const {
      q,
      state,
      licenseStatus,
      verificationStatus,
      expirationWindow,
      minCompleteness,
      sourceType,
      page = 1,
      limit = 50,
      sort = "createdAt_desc",
    } = req.query;

    const filter = {};

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { business_name: regex },
        { dba: regex },
        { license_number: regex },
        { "contact_information.phone": regex },
        { "contact_information.email": regex },
      ];
    }

    if (state) filter.stateName = state;
    if (licenseStatus)
      filter.license_status = new RegExp(
        `^${licenseStatus.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i",
      );

    // Verified = claimed:true; Unverified = claimed:false
    if (verificationStatus === "verified") filter.claimed = true;
    if (verificationStatus === "unverified") filter.claimed = false;

    // Admin-verified: latest VR is manual + approved
    if (verificationStatus === "adminVerified") {
      const ids = await pharmacyIdsByLatestVR({
        status: "approved",
        method: "manual",
      });
      filter._id = { $in: ids };
    }
    // Auto-verified: latest VR is auto + auto_verified
    if (verificationStatus === "autoVerified") {
      const ids = await pharmacyIdsByLatestVR({
        status: "auto_verified",
        method: "auto",
      });
      filter._id = { $in: ids };
    }
    // Pending: latest VR is pending
    if (verificationStatus === "pending") {
      const ids = await pharmacyIdsByLatestVR({ status: "pending" });
      filter._id = { $in: ids };
    }

    if (expirationWindow) {
      const now = new Date();
      const d30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const d90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      if (expirationWindow === "expired") filter.expiration_date = { $lt: now };
      if (expirationWindow === "lt30")
        filter.expiration_date = { $gte: now, $lt: d30 };
      if (expirationWindow === "30-90")
        filter.expiration_date = { $gte: d30, $lt: d90 };
    }

    if (minCompleteness) {
      const min = parseInt(minCompleteness);
      if (!isNaN(min)) filter.dataCompletenessScore = { $gte: min };
    }

    if (sourceType) filter.sourceType = sourceType;

    const sortMap = {
      createdAt_desc: { createdAt: -1 },
      createdAt_asc: { createdAt: 1 },
      business_name_asc: { business_name: 1 },
      expiration_asc: { expiration_date: 1 },
      rating_desc: { rating: -1 },
    };
    const sortObj = sortMap[sort] || { createdAt: -1 };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, total] = await Promise.all([
      LicenseRecord.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      LicenseRecord.countDocuments(filter),
    ]);

    // Attach latest VR status to each record for badge display
    const pageIds = records.map((r) => r._id.toString());
    const latestVRs = await VerificationRequest.aggregate([
      { $match: { pharmacyId: { $in: pageIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$pharmacyId",
          status: { $first: "$status" },
          method: { $first: "$verification_method" },
        },
      },
    ]);
    const vrMap = Object.fromEntries(
      latestVRs.map((v) => [v._id, { status: v.status, method: v.method }]),
    );
    const enrichedRecords = records.map((r) => ({
      ...r,
      _vrStatus: vrMap[r._id.toString()] || null,
    }));

    const now = new Date();
    const d30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Helper: combine current filter with an extra condition safely
    const withFilter = (extra) =>
      Object.keys(filter).length ? { $and: [filter, extra] } : extra;

    // Filter-scoped stat card counts (reflect current search/filter)
    const [
      filteredVerifiedCount,
      filteredExpiringSoonCount,
      filteredDataGapsCount,
    ] = await Promise.all([
      LicenseRecord.countDocuments(withFilter({ claimed: true })),
      LicenseRecord.countDocuments(
        withFilter({ expiration_date: { $gte: now, $lt: d30 } }),
      ),
      LicenseRecord.countDocuments(
        withFilter({
          $or: [
            { owner_id: null },
            { "contact_information.phone": { $in: [null, ""] } },
          ],
        }),
      ),
    ]);

    // Aggregate sidebar facet counts (all run in parallel)
    const [
      stateFacet,
      statusFacet,
      adminVerifiedCount,
      autoVerifiedCount,
      claimedCount,
      unclaimedCount,
      expiringSoonCount,
      expiredByDateCount,
      dataGapsCount,
      pendingVRCount,
    ] = await Promise.all([
      LicenseRecord.aggregate([
        { $group: { _id: "$stateName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 30 },
      ]),
      LicenseRecord.aggregate([
        { $group: { _id: "$license_status", count: { $sum: 1 } } },
      ]),
      // Admin-verified = latest VR is manual + approved
      pharmacyIdsByLatestVR({ status: "approved", method: "manual" }).then(
        (ids) => LicenseRecord.countDocuments({ _id: { $in: ids } }),
      ),
      // Auto-verified = latest VR is auto + auto_verified
      pharmacyIdsByLatestVR({ status: "auto_verified", method: "auto" }).then(
        (ids) => LicenseRecord.countDocuments({ _id: { $in: ids } }),
      ),
      // Verified = claimed:true
      LicenseRecord.countDocuments({ claimed: true }),
      // Unverified = claimed:false
      LicenseRecord.countDocuments({ claimed: false }),
      // Expiring soon = license expiring within 30 days (not already expired)
      LicenseRecord.countDocuments({
        expiration_date: { $gte: now, $lt: d30 },
      }),
      // Expired by date = expiration_date is in the past
      LicenseRecord.countDocuments({
        expiration_date: { $lt: now },
      }),
      // Data gaps = no owner linked OR no contact phone
      LicenseRecord.countDocuments({
        $or: [
          { owner_id: null },
          { "contact_information.phone": { $in: [null, ""] } },
        ],
      }),
      // Pending = shops whose latest VR is pending
      pharmacyIdsByLatestVR({ status: "pending" }).then((ids) => ids.length),
    ]);

    res.json({
      success: true,
      data: enrichedRecords,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      stats: {
        verifiedCount: filteredVerifiedCount,
        expiringSoon: filteredExpiringSoonCount,
        dataGaps: filteredDataGapsCount,
      },
      facets: {
        states: stateFacet,
        licenseStatuses: statusFacet,
        claimedCount,
        unclaimedCount,
        expiringSoonCount,
        expiredByDateCount,
        dataGapsCount,
        pendingVRCount,
        verifiedBreakdown: {
          total: claimedCount,
          adminVerified: adminVerifiedCount,
          autoVerified: autoVerifiedCount,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/admin/canoja-verified
async function listCanojaVerified(req, res) {
  try {
    const {
      q,
      status,
      region,
      source,
      renewalStatus,
      businessStatus,
      hasMenu,
      minRating,
      licenseStatus,
      serviceType,
      page = 1,
      limit = 50,
    } = req.query;

    const now = new Date();
    const d30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const filter = { canojaVerified: true };
    if (region) filter.stateName = region;
    if (source) filter.sourceType = source;
    if (businessStatus)
      filter.business_status = new RegExp(businessStatus, "i");
    if (minRating) filter.rating = { $gte: parseFloat(minRating) };
    if (licenseStatus === "Inactive" || licenseStatus === "Expired") {
      filter.expiration_date = { $lt: now };
    } else if (licenseStatus === "Active") {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { expiration_date: { $gt: now } },
            { expiration_date: null },
            { expiration_date: { $exists: false } },
          ],
        },
      ];
    } else if (licenseStatus) {
      filter.license_status = new RegExp(`^${licenseStatus}$`, "i");
    }
    if (serviceType === "delivery")
      filter.subtypes = { $elemMatch: { $regex: /delivery/i } };
    if (serviceType === "pickup")
      filter.subtypes = { $elemMatch: { $regex: /pickup|pick.up/i } };
    if (hasMenu === "true")
      filter.$or = [
        { menu_link: { $exists: true, $ne: null, $ne: "" } },
        { menu: { $exists: true, $ne: null, $ne: "" } },
        { order_links: { $exists: true, $ne: null, $ne: "" } },
      ];
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { business_name: regex },
            { license_number: regex },
            { stateName: regex },
          ],
        },
      ];
    }

    if (status === "active") {
      filter.$or = [
        { expiration_date: { $gt: d30 } },
        { expiration_date: null },
        { expiration_date: { $exists: false } },
      ];
    } else if (status === "expiringSoon") {
      filter.expiration_date = { $gte: now, $lte: d30 };
    } else if (status === "revoked") {
      filter.expiration_date = { $lt: now };
    }

    if (renewalStatus === "due") {
      filter.expiration_date = { $gte: now, $lte: d30 };
    } else if (renewalStatus === "upcoming") {
      const d60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      filter.expiration_date = { $gt: d30, $lte: d60 };
    } else if (renewalStatus === "overdue") {
      filter.expiration_date = { $lt: now };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const d60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    // baseFilter excludes status/renewalStatus so sidebar counts always show full breakdown
    const baseFilter = { canojaVerified: true };
    if (region) baseFilter.stateName = region;
    if (source) baseFilter.sourceType = source;
    if (businessStatus)
      baseFilter.business_status = new RegExp(businessStatus, "i");
    if (minRating) baseFilter.rating = { $gte: parseFloat(minRating) };
    if (licenseStatus === "Inactive" || licenseStatus === "Expired") {
      baseFilter.expiration_date = { $lt: now };
    } else if (licenseStatus === "Active") {
      baseFilter.$and = [
        ...(baseFilter.$and || []),
        {
          $or: [
            { expiration_date: { $gt: now } },
            { expiration_date: null },
            { expiration_date: { $exists: false } },
          ],
        },
      ];
    } else if (licenseStatus) {
      baseFilter.license_status = new RegExp(`^${licenseStatus}$`, "i");
    }
    if (serviceType === "delivery")
      baseFilter.subtypes = { $elemMatch: { $regex: /delivery/i } };
    if (serviceType === "pickup")
      baseFilter.subtypes = { $elemMatch: { $regex: /pickup|pick.up/i } };
    if (hasMenu === "true") baseFilter.$or = filter.$or;
    if (q) baseFilter.$and = filter.$and;

    const withBase = (extra) => ({ $and: [baseFilter, extra] });

    const [
      records,
      total,
      activeCount,
      expiringSoonCount,
      revokedCount,
      renewalDueCount,
      renewalUpcomingCount,
      renewalOverdueCount,
      statesFacet,
      viewsResult,
      openNowCount,
      deliveryCount,
      avgRatingResult,
    ] = await Promise.all([
      LicenseRecord.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      LicenseRecord.countDocuments(filter),
      LicenseRecord.countDocuments(
        withBase({
          $or: [
            { expiration_date: { $gt: d30 } },
            { expiration_date: null },
            { expiration_date: { $exists: false } },
          ],
        }),
      ),
      LicenseRecord.countDocuments(
        withBase({ expiration_date: { $gte: now, $lte: d30 } }),
      ),
      LicenseRecord.countDocuments(withBase({ expiration_date: { $lt: now } })),
      LicenseRecord.countDocuments(
        withBase({ expiration_date: { $gte: now, $lte: d30 } }),
      ),
      LicenseRecord.countDocuments(
        withBase({ expiration_date: { $gt: d30, $lte: d60 } }),
      ),
      LicenseRecord.countDocuments(withBase({ expiration_date: { $lt: now } })),
      LicenseRecord.aggregate([
        { $match: { canojaVerified: true } },
        { $group: { _id: "$stateName", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
      ]),
      LicenseRecord.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, totalViews: { $sum: "$view_count" } } },
      ]),
      LicenseRecord.countDocuments({ ...baseFilter, business_status: "OPEN" }),
      LicenseRecord.countDocuments({
        ...baseFilter,
        $or: [
          { order_links: { $exists: true, $not: { $in: [null, ""] } } },
          { subtypes: { $elemMatch: { $regex: /delivery/i } } },
        ],
      }),
      LicenseRecord.aggregate([
        {
          $match: {
            ...baseFilter,
            rating: { $gt: 0, $exists: true, $ne: null },
          },
        },
        { $group: { _id: null, avg: { $avg: "$rating" } } },
      ]),
    ]);

    const totalBadgeViews = viewsResult[0]?.totalViews || 0;
    const avgRating =
      avgRatingResult[0]?.avg != null
        ? parseFloat(avgRatingResult[0].avg.toFixed(1))
        : null;

    res.json({
      success: true,
      data: records,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      stats: {
        active: activeCount,
        expiringSoon: expiringSoonCount,
        revoked: revokedCount,
        renewalDue: renewalDueCount,
        renewalUpcoming: renewalUpcomingCount,
        renewalOverdue: renewalOverdueCount,
        totalBadgeViews,
        openNow: openNowCount,
        deliveryReady: deliveryCount,
        avgRating,
      },
      facets: {
        states: statesFacet,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/admin/pending-verifications  (enhanced; existing /verification-requests/admin/pending untouched)
async function listPendingVerifications(req, res) {
  try {
    const {
      q,
      region,
      submissionAge,
      priority,
      submissionType,
      slaBreach,
      missingDocuments,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = { status: "pending" };

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { legal_business_name: regex },
        { "license_information.license_number": regex },
        { "contact_person.email_address": regex },
        { physical_address: regex },
      ];
    }

    if (region) {
      const STATE_NAMES = {
        AL: "Alabama",
        AK: "Alaska",
        AZ: "Arizona",
        AR: "Arkansas",
        CA: "California",
        CO: "Colorado",
        CT: "Connecticut",
        DE: "Delaware",
        FL: "Florida",
        GA: "Georgia",
        HI: "Hawaii",
        ID: "Idaho",
        IL: "Illinois",
        IN: "Indiana",
        IA: "Iowa",
        KS: "Kansas",
        KY: "Kentucky",
        LA: "Louisiana",
        ME: "Maine",
        MD: "Maryland",
        MA: "Massachusetts",
        MI: "Michigan",
        MN: "Minnesota",
        MS: "Mississippi",
        MO: "Missouri",
        MT: "Montana",
        NE: "Nebraska",
        NV: "Nevada",
        NH: "New Hampshire",
        NJ: "New Jersey",
        NM: "New Mexico",
        NY: "New York",
        NC: "North Carolina",
        ND: "North Dakota",
        OH: "Ohio",
        OK: "Oklahoma",
        OR: "Oregon",
        PA: "Pennsylvania",
        RI: "Rhode Island",
        SC: "South Carolina",
        SD: "South Dakota",
        TN: "Tennessee",
        TX: "Texas",
        UT: "Utah",
        VT: "Vermont",
        VA: "Virginia",
        WA: "Washington",
        WV: "West Virginia",
        WI: "Wisconsin",
        WY: "Wyoming",
        DC: "District of Columbia",
      };
      const fullName = STATE_NAMES[region.toUpperCase()];
      const pattern = fullName
        ? `\\b(${region}|${fullName})\\b`
        : `\\b${region.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`;
      const regionRegex = new RegExp(pattern, "i");
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { "license_information.jurisdiction": regionRegex },
            { "license_information.issuing_authority": regionRegex },
            { physical_address: regionRegex },
          ],
        },
      ];
    }

    if (submissionAge) {
      const now = new Date();
      const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const h72 = new Date(now.getTime() - 72 * 60 * 60 * 1000);
      if (submissionAge === "lt24") filter.createdAt = { $gte: h24 };
      if (submissionAge === "24-72") filter.createdAt = { $gte: h72, $lt: h24 };
      if (submissionAge === "gt72") filter.createdAt = { $lt: h72 };
    }

    if (priority) {
      const pNow = new Date();
      const ph72 = new Date(pNow.getTime() - 72 * 60 * 60 * 1000);
      const ph24 = new Date(pNow.getTime() - 24 * 60 * 60 * 1000);
      if (priority === "high") {
        const highOr = {
          $or: [{ adminVerifiedRequired: true }, { createdAt: { $lt: ph72 } }],
        };
        filter.$and = [...(filter.$and || []), highOr];
      } else if (priority === "medium") {
        filter.createdAt = { $gte: ph72, $lt: ph24 };
        filter.adminVerifiedRequired = { $ne: true };
      } else if (priority === "low") {
        filter.createdAt = { $gte: ph24 };
        filter.adminVerifiedRequired = { $ne: true };
      }
    }
    if (submissionType) filter.verification_method = submissionType; // "auto" | "manual"
    if (slaBreach === "true") {
      const h72 = new Date(Date.now() - 72 * 60 * 60 * 1000);
      filter.createdAt = { $lt: h72 };
    }
    if (missingDocuments === "true") {
      filter.$or = [
        ...(filter.$or || []),
        { "uploaded_documents.state_license_document": { $in: [null, ""] } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const now = new Date();
    const h72 = new Date(now.getTime() - 72 * 60 * 60 * 1000);
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Combine current filter with an extra condition using $and so existing conditions aren't clobbered
    const withFilter = (extra) => ({ $and: [filter, extra] });

    const [
      requests,
      total,
      slaBreaches,
      highPriority,
      lt24Count,
      between24and72Count,
      missingDocsCount,
      stateFacet,
      avgResult,
    ] = await Promise.all([
      VerificationRequest.find(filter)
        .sort({ createdAt: 1 }) // oldest first — queue order
        .skip(skip)
        .limit(parseInt(limit)),
      VerificationRequest.countDocuments(filter),
      VerificationRequest.countDocuments(
        withFilter({ createdAt: { $lt: h72 } }),
      ),
      VerificationRequest.countDocuments(
        withFilter({
          $or: [{ adminVerifiedRequired: true }, { createdAt: { $lt: h72 } }],
        }),
      ),
      VerificationRequest.countDocuments(
        withFilter({ createdAt: { $gte: h24 } }),
      ),
      VerificationRequest.countDocuments(
        withFilter({ createdAt: { $gte: h72, $lt: h24 } }),
      ),
      VerificationRequest.countDocuments(
        withFilter({
          $or: [
            {
              "uploaded_documents.state_license_document": { $in: [null, ""] },
            },
            { "uploaded_documents.state_license_document": { $exists: false } },
          ],
        }),
      ),
      VerificationRequest.aggregate([
        { $match: { status: "pending" } },
        {
          $addFields: {
            _stateMatch: {
              $regexFind: {
                input: { $ifNull: ["$physical_address", ""] },
                regex: ",\\s*([A-Z]{2})\\b",
              },
            },
          },
        },
        {
          $addFields: {
            _state: {
              $ifNull: [{ $arrayElemAt: ["$_stateMatch.captures", 0] }, null],
            },
          },
        },
        {
          $match: {
            _state: {
              $in: [
                "AL",
                "AK",
                "AZ",
                "AR",
                "CA",
                "CO",
                "CT",
                "DE",
                "FL",
                "GA",
                "HI",
                "ID",
                "IL",
                "IN",
                "IA",
                "KS",
                "KY",
                "LA",
                "ME",
                "MD",
                "MA",
                "MI",
                "MN",
                "MS",
                "MO",
                "MT",
                "NE",
                "NV",
                "NH",
                "NJ",
                "NM",
                "NY",
                "NC",
                "ND",
                "OH",
                "OK",
                "OR",
                "PA",
                "RI",
                "SC",
                "SD",
                "TN",
                "TX",
                "UT",
                "VT",
                "VA",
                "WA",
                "WV",
                "WI",
                "WY",
                "DC",
              ],
            },
          },
        },
        { $group: { _id: "$_state", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      VerificationRequest.aggregate([
        {
          $match: {
            status: { $in: ["approved", "rejected"] },
            processedAt: { $exists: true, $ne: null },
          },
        },
        {
          $project: { diffMs: { $subtract: ["$processedAt", "$createdAt"] } },
        },
        { $group: { _id: null, avgMs: { $avg: "$diffMs" } } },
      ]),
    ]);

    const avgMs = avgResult[0]?.avgMs || null;
    const avgTimeToVerify =
      avgMs !== null
        ? avgMs < 3600000
          ? `${Math.round(avgMs / 60000)}m`
          : `${(avgMs / 3600000).toFixed(1)}h`
        : null;

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      stats: {
        pendingTotal: total,
        highPriority,
        slaBreaches,
        lt24Count,
        between24and72Count,
        missingDocsCount,
        avgTimeToVerify,
      },
      facets: {
        states: stateFacet,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/admin/pending-requests
async function listPendingRequests(req, res) {
  try {
    const {
      requestType,
      status,
      q,
      market,
      minScore,
      maxScore,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};
    if (status) filter.status = status;

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { legal_business_name: regex },
        { "contact_person.email_address": regex },
        { "contact_person.full_name": regex },
        { business_phone_number: regex },
      ];
    }

    if (requestType === "claim") filter.claimRequested = true;
    if (requestType === "verify") filter.verifyRequested = true;

    if (market) {
      const STATE_NAMES = {
        AL: "Alabama",
        AK: "Alaska",
        AZ: "Arizona",
        AR: "Arkansas",
        CA: "California",
        CO: "Colorado",
        CT: "Connecticut",
        DE: "Delaware",
        FL: "Florida",
        GA: "Georgia",
        HI: "Hawaii",
        ID: "Idaho",
        IL: "Illinois",
        IN: "Indiana",
        IA: "Iowa",
        KS: "Kansas",
        KY: "Kentucky",
        LA: "Louisiana",
        ME: "Maine",
        MD: "Maryland",
        MA: "Massachusetts",
        MI: "Michigan",
        MN: "Minnesota",
        MS: "Mississippi",
        MO: "Missouri",
        MT: "Montana",
        NE: "Nebraska",
        NV: "Nevada",
        NH: "New Hampshire",
        NJ: "New Jersey",
        NM: "New Mexico",
        NY: "New York",
        NC: "North Carolina",
        ND: "North Dakota",
        OH: "Ohio",
        OK: "Oklahoma",
        OR: "Oregon",
        PA: "Pennsylvania",
        RI: "Rhode Island",
        SC: "South Carolina",
        SD: "South Dakota",
        TN: "Tennessee",
        TX: "Texas",
        UT: "Utah",
        VT: "Vermont",
        VA: "Virginia",
        WA: "Washington",
        WV: "West Virginia",
        WI: "Wisconsin",
        WY: "Wyoming",
        DC: "District of Columbia",
      };
      const fullName = STATE_NAMES[market.toUpperCase()];
      const pattern = fullName
        ? `\\b(${market}|${fullName})\\b`
        : `\\b${market}\\b`;
      filter.physical_address = new RegExp(pattern, "i");
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Base filter: search only, no status/type — so sidebar counts are always global across all statuses/types
    const baseFilter = q ? { $or: filter.$or } : {};
    if (market) baseFilter.physical_address = filter.physical_address; // same regex

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    // Completeness score pipeline — mirrors client-side computeCompleteness (10 fields)
    const scoreAddField = {
      $addFields: {
        _score: {
          $multiply: [
            {
              $divide: [
                {
                  $add: [
                    {
                      $cond: [
                        {
                          $and: [
                            { $ifNull: ["$legal_business_name", false] },
                            { $ne: ["$legal_business_name", ""] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                    {
                      $cond: [
                        {
                          $and: [
                            { $ifNull: ["$physical_address", false] },
                            { $ne: ["$physical_address", ""] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                    {
                      $cond: [
                        {
                          $and: [
                            { $ifNull: ["$business_phone_number", false] },
                            { $ne: ["$business_phone_number", ""] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                    {
                      $cond: [
                        {
                          $and: [
                            {
                              $ifNull: ["$website_or_social_media_link", false],
                            },
                            { $ne: ["$website_or_social_media_link", ""] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                    {
                      $cond: [
                        {
                          $and: [
                            { $ifNull: ["$contact_person.full_name", false] },
                            { $ne: ["$contact_person.full_name", ""] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                    {
                      $cond: [
                        {
                          $and: [
                            {
                              $ifNull: ["$contact_person.email_address", false],
                            },
                            { $ne: ["$contact_person.email_address", ""] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                    {
                      $cond: [
                        {
                          $and: [
                            {
                              $ifNull: [
                                "$contact_person.role_or_position",
                                false,
                              ],
                            },
                            { $ne: ["$contact_person.role_or_position", ""] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                    {
                      $cond: [
                        {
                          $and: [
                            {
                              $ifNull: [
                                "$contact_person.government_issued_id_document",
                                false,
                              ],
                            },
                            {
                              $ne: [
                                "$contact_person.government_issued_id_document",
                                "",
                              ],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                    {
                      $cond: [
                        {
                          $and: [
                            {
                              $ifNull: [
                                "$license_information.license_number",
                                false,
                              ],
                            },
                            {
                              $ne: ["$license_information.license_number", ""],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                    {
                      $cond: [
                        {
                          $and: [
                            {
                              $ifNull: [
                                "$uploaded_documents.state_license_document",
                                false,
                              ],
                            },
                            {
                              $ne: [
                                "$uploaded_documents.state_license_document",
                                "",
                              ],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  ],
                },
                10,
              ],
            },
            100,
          ],
        },
      },
    };

    const useScoreFilter = minScore !== undefined || maxScore !== undefined;
    const scoreMatch = useScoreFilter
      ? {
          $match: {
            _score: {
              ...(minScore !== undefined ? { $gte: Number(minScore) } : {}),
              ...(maxScore !== undefined ? { $lte: Number(maxScore) } : {}),
            },
          },
        }
      : null;

    const fetchRequests = useScoreFilter
      ? VerificationRequest.aggregate([
          { $match: filter },
          scoreAddField,
          scoreMatch,
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: parseInt(limit) },
        ])
      : VerificationRequest.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit));

    const fetchTotal = useScoreFilter
      ? VerificationRequest.aggregate([
          { $match: filter },
          scoreAddField,
          scoreMatch,
          { $count: "total" },
        ]).then((r) => r[0]?.total ?? 0)
      : VerificationRequest.countDocuments(filter);

    // Helper: count with optional score filter applied
    const countWith = (extra) => {
      if (!useScoreFilter)
        return VerificationRequest.countDocuments({ ...baseFilter, ...extra });
      return VerificationRequest.aggregate([
        { $match: { ...baseFilter, ...extra } },
        scoreAddField,
        scoreMatch,
        { $count: "n" },
      ]).then((r) => r[0]?.n ?? 0);
    };

    const [
      requests,
      total,
      claimCount,
      verifyCount,
      pendingCount,
      approvedCount,
      rejectedCount,
      autoVerifiedCount,
      newTodayCount,
      convertedThisWeekCount,
    ] = await Promise.all([
      fetchRequests,
      fetchTotal,
      countWith({ claimRequested: true }),
      countWith({ verifyRequested: true }),
      countWith({ status: "pending" }),
      countWith({ status: "approved" }),
      countWith({ status: "rejected" }),
      countWith({ status: "auto_verified" }),
      countWith({ createdAt: { $gte: todayStart } }),
      countWith({ status: "approved", processedAt: { $gte: weekStart } }),
    ]);

    // Duplicate detection — flag VRs that share license_number or business_name with another pending request
    const requestIds = requests.map((r) => r._id);
    const licenseNums = requests
      .map((r) => r.license_information?.license_number)
      .filter(Boolean);
    const businessNames = requests
      .map((r) => r.legal_business_name)
      .filter(Boolean);

    // Flag if another PENDING request shares the same business name or license number
    const otherPending = await VerificationRequest.find({
      status: "pending",
      _id: { $nin: requestIds },
      $or: [
        ...(licenseNums.length
          ? [{ "license_information.license_number": { $in: licenseNums } }]
          : []),
        ...(businessNames.length
          ? [{ legal_business_name: { $in: businessNames } }]
          : []),
      ],
    })
      .select("license_information.license_number legal_business_name")
      .lean();

    const dupLicenses = new Set(
      otherPending
        .map((r) => r.license_information?.license_number)
        .filter(Boolean),
    );
    const dupNames = new Set(
      otherPending.map((r) => r.legal_business_name).filter(Boolean),
    );

    const enrichedRequests = requests.map((r) => ({
      ...(typeof r.toObject === "function" ? r.toObject() : r),
      duplicateFlag:
        (r.license_information?.license_number &&
          dupLicenses.has(r.license_information.license_number)) ||
        (r.legal_business_name && dupNames.has(r.legal_business_name)),
    }));

    const VALID_STATES = [
      "AL",
      "AK",
      "AZ",
      "AR",
      "CA",
      "CO",
      "CT",
      "DE",
      "FL",
      "GA",
      "HI",
      "ID",
      "IL",
      "IN",
      "IA",
      "KS",
      "KY",
      "LA",
      "ME",
      "MD",
      "MA",
      "MI",
      "MN",
      "MS",
      "MO",
      "MT",
      "NE",
      "NV",
      "NH",
      "NJ",
      "NM",
      "NY",
      "NC",
      "ND",
      "OH",
      "OK",
      "OR",
      "PA",
      "RI",
      "SC",
      "SD",
      "TN",
      "TX",
      "UT",
      "VT",
      "VA",
      "WA",
      "WV",
      "WI",
      "WY",
      "DC",
    ];
    const stateFacet = await VerificationRequest.aggregate([
      {
        $addFields: {
          _stateMatch: {
            $regexFind: {
              input: { $ifNull: ["$physical_address", ""] },
              regex: ",\\s*([A-Z]{2})\\b",
            },
          },
        },
      },
      {
        $addFields: {
          _state: {
            $ifNull: [{ $arrayElemAt: ["$_stateMatch.captures", 0] }, null],
          },
        },
      },
      { $match: { _state: { $in: VALID_STATES } } },
      { $group: { _id: "$_state", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    res.json({
      success: true,
      data: enrichedRequests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      stats: {
        openRequests: total,
        claimBusiness: claimCount,
        verifyBusiness: verifyCount,
        duplicateSignals: enrichedRequests.filter((r) => r.duplicateFlag)
          .length,
        pendingCount,
        approvedCount,
        rejectedCount,
        autoVerifiedCount,
        newTodayCount,
        convertedThisWeekCount,
      },
      facets: {
        states: stateFacet,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/admin/audit-log?targetType=&targetId=&page=
async function listAuditLog(req, res) {
  try {
    const {
      targetType,
      targetId,
      actorId,
      actions,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};
    if (targetType) filter.targetType = targetType;
    if (targetId) filter.targetId = targetId;
    if (actorId) filter.actor = actorId;
    if (actions) filter.action = { $in: actions.split(",") };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("actor", "name email"),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// POST /api/admin/retailers
async function createRetailer(req, res) {
  try {
    const {
      business_name,
      license_number,
      stateName,
      city,
      business_address,
      license_type,
      license_status,
      expiration_date,
      sourceType,
      phone,
      email,
    } = req.body;

    if (!business_name) {
      return res
        .status(400)
        .json({ success: false, error: "business_name is required" });
    }

    const record = await LicenseRecord.create({
      business_name,
      license_number: license_number || "",
      stateName: stateName || "",
      city: city || "",
      business_address: business_address || "",
      license_type: license_type || "",
      license_status: license_status || "active",
      expiration_date: expiration_date ? new Date(expiration_date) : null,
      sourceType: sourceType || "manual",
      contact_information: {
        phone: phone || "",
        email: email || "",
      },
    });

    await AuditLog.create({
      actor: req.user._id,
      action: "create_retailer",
      targetType: "LicenseRecord",
      targetId: record._id,
      after: {
        business_name: record.business_name,
        license_number: record.license_number,
      },
    }).catch(() => {});

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// PATCH /api/admin/pending-verifications/:id/escalate
async function escalatePendingVerification(req, res) {
  try {
    const request = await VerificationRequest.findById(req.params.id);
    if (!request)
      return res
        .status(404)
        .json({ success: false, error: "Request not found" });

    const { note } = req.body;
    request.adminVerifiedRequired = true;
    if (note) request.notes = note;
    await request.save();

    await AuditLog.create({
      actor: req.user._id,
      action: "escalate_verification",
      targetType: "VerificationRequest",
      targetId: request._id,
      after: { adminVerifiedRequired: true },
      metadata: { note: note || "", businessName: request.legal_business_name },
    }).catch(() => {});

    res.json({ success: true, message: "Request escalated to high priority" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// POST /api/admin/canoja-verified/issue
async function issueVerification(req, res) {
  try {
    const { id, expiration_date } = req.body;
    if (!id)
      return res.status(400).json({ success: false, error: "id is required" });

    const record = await LicenseRecord.findById(id);
    if (!record)
      return res
        .status(404)
        .json({ success: false, error: "Record not found" });

    record.canojaVerified = true;
    record.lastVerifiedDate = new Date();
    if (expiration_date) record.expiration_date = new Date(expiration_date);
    record.verificationLifecycle = [
      ...(record.verificationLifecycle || []),
      {
        status: "issued",
        at: new Date(),
        by: req.user._id,
        note: "Issued by admin",
      },
    ];
    await record.save();

    await AuditLog.create({
      actor: req.user._id,
      action: "issue_verified_badge",
      targetType: "LicenseRecord",
      targetId: record._id,
      after: { canojaVerified: true, expiration_date: record.expiration_date },
      metadata: { businessName: record.business_name },
    }).catch(() => {});

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

async function revokeVerifiedBadge(req, res) {
  try {
    const record = await LicenseRecord.findById(req.params.id);
    if (!record)
      return res
        .status(404)
        .json({ success: false, error: "Record not found" });

    const wasCanojaVerified = record.canojaVerified;
    record.canojaVerified = false;
    await record.save();

    await AuditLog.create({
      actor: req.user._id,
      action: "revoke_verified_badge",
      targetType: "LicenseRecord",
      targetId: record._id,
      before: { canojaVerified: wasCanojaVerified },
      after: { canojaVerified: false },
      metadata: { businessName: record.business_name },
    }).catch(() => {});

    res.json({ success: true, message: "Badge revoked" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// PATCH /api/admin/canoja-verified/:id/renew
async function renewCanojaVerified(req, res) {
  try {
    const record = await LicenseRecord.findById(req.params.id);
    if (!record)
      return res
        .status(404)
        .json({ success: false, error: "Record not found" });

    const { expiration_date } = req.body;
    const wasCanojaVerified = record.canojaVerified;
    record.canojaVerified = true;
    record.lastVerifiedDate = new Date();
    if (expiration_date) record.expiration_date = new Date(expiration_date);
    record.verificationLifecycle = [
      ...(record.verificationLifecycle || []),
      {
        status: "renewed",
        at: new Date(),
        by: req.user._id,
        note: expiration_date
          ? `New expiry: ${expiration_date}`
          : "Renewed by admin",
      },
    ];
    await record.save();

    await AuditLog.create({
      actor: req.user._id,
      action: "renew_verified_badge",
      targetType: "LicenseRecord",
      targetId: record._id,
      before: { canojaVerified: wasCanojaVerified },
      after: { canojaVerified: true, expiration_date: record.expiration_date },
      metadata: { businessName: record.business_name },
    }).catch(() => {});

    res.json({ success: true, message: "Badge renewed", data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/admin/requests/:id/messages
async function listRequestMessages(req, res) {
  try {
    const messages = await RequestMessage.find({
      requestId: req.params.id,
    }).sort({ createdAt: 1 });
    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// POST /api/admin/requests/:id/messages
async function createRequestMessage(req, res) {
  try {
    const { body } = req.body;
    if (!body?.trim())
      return res
        .status(400)
        .json({ success: false, error: "Message body is required" });

    const message = await RequestMessage.create({
      requestId: req.params.id,
      body: body.trim(),
      fromAdmin: true,
      senderName: req.user?.name || "Admin",
    });

    // Send email to operator
    const request = await VerificationRequest.findById(req.params.id).lean();
    if (request) {
      const toEmail = request.contact_person?.email_address;
      const businessName = request.legal_business_name || "your business";
      if (toEmail) {
        sendAdminMessageEmail(toEmail, businessName, body.trim()).catch((err) =>
          console.error("Failed to send admin message email:", err),
        );
      }
    }

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// POST /api/admin/pending-requests
async function createPendingRequest(req, res) {
  try {
    const {
      legal_business_name,
      physical_address,
      business_phone_number,
      website_or_social_media_link,
      business_type,
      requestType, // "claim" | "verify"
      contact_person,
      license_information,
      notes,
    } = req.body;

    if (!legal_business_name)
      return res
        .status(400)
        .json({ success: false, error: "legal_business_name is required" });
    if (!physical_address)
      return res
        .status(400)
        .json({ success: false, error: "physical_address is required" });
    if (!business_phone_number)
      return res
        .status(400)
        .json({ success: false, error: "business_phone_number is required" });
    if (!contact_person?.full_name)
      return res.status(400).json({
        success: false,
        error: "contact_person.full_name is required",
      });
    if (!contact_person?.email_address)
      return res.status(400).json({
        success: false,
        error: "contact_person.email_address is required",
      });
    if (!contact_person?.phone_number)
      return res.status(400).json({
        success: false,
        error: "contact_person.phone_number is required",
      });
    if (!contact_person?.role_or_position)
      return res.status(400).json({
        success: false,
        error: "contact_person.role_or_position is required",
      });

    const request = await VerificationRequest.create({
      legal_business_name,
      physical_address,
      business_phone_number,
      website_or_social_media_link: website_or_social_media_link || "",
      business_type: business_type || undefined,
      claimRequested: requestType === "claim",
      verifyRequested: requestType === "verify",
      contact_person: {
        full_name: contact_person.full_name,
        email_address: contact_person.email_address,
        phone_number: contact_person.phone_number,
        role_or_position: contact_person.role_or_position,
      },
      license_information: license_information || {},
      notes: notes || "",
      status: "pending",
      verification_method: "manual",
      adminVerifiedRequired: true,
      ownership_attestation: true,
      leadSource: "Admin Outreach",
      verification_metadata: {
        submission_timestamp: new Date(),
      },
    });

    await AuditLog.create({
      actor: req.user._id,
      action: "create_pending_request",
      targetType: "VerificationRequest",
      targetId: request._id,
      after: { legal_business_name, requestType },
      metadata: { createdByAdmin: true },
    }).catch(() => {});

    res.status(201).json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  listUsers,
  toggleUserStatus,
  listVerificationHistory,
  // Phase 2 additions
  listRetailers,
  createRetailer,
  listCanojaVerified,
  issueVerification,
  listPendingVerifications,
  escalatePendingVerification,
  listPendingRequests,
  createPendingRequest,
  listAuditLog,
  revokeVerifiedBadge,
  renewCanojaVerified,
  listRequestMessages,
  createRequestMessage,
};
