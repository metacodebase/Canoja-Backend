const User = require("../models/user");
const VerificationRequest = require("../models/verificationRequest");
const LicenseRecord = require("../models/licenseRecord");
const AuditLog = require("../models/auditLog");

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
    const { q, status, region, source, page = 1, limit = 50 } = req.query;

    const now = new Date();
    const d30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const filter = { canojaVerified: true };
    if (region) filter.stateName = region;
    if (source) filter.sourceType = source;
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
      // Revoked = not currently canoja verified but has been claimed/verified before
      filter.canojaVerified = false;
      filter.claimed = true;
      filter.license_status = { $in: ["revoked", "expired", "inactive"] };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, total] = await Promise.all([
      LicenseRecord.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      LicenseRecord.countDocuments(filter),
    ]);

    // Summary stats (always computed against full dataset, ignoring current filters)
    const [activeCount, expiringSoonCount, revokedCount] = await Promise.all([
      LicenseRecord.countDocuments({
        canojaVerified: true,
        $or: [
          { expiration_date: { $gt: d30 } },
          { expiration_date: null },
          { expiration_date: { $exists: false } },
        ],
      }),
      LicenseRecord.countDocuments({
        canojaVerified: true,
        expiration_date: { $gte: now, $lte: d30 },
      }),
      LicenseRecord.countDocuments({
        canojaVerified: false,
        claimed: true,
        license_status: { $in: ["revoked", "expired"] },
      }),
    ]);

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
      filter["license_information.jurisdiction"] = new RegExp(
        region.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
    }

    if (submissionAge) {
      const now = new Date();
      const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const h72 = new Date(now.getTime() - 72 * 60 * 60 * 1000);
      if (submissionAge === "lt24") filter.createdAt = { $gte: h24 };
      if (submissionAge === "24-72") filter.createdAt = { $gte: h72, $lt: h24 };
      if (submissionAge === "gt72") filter.createdAt = { $lt: h72 };
    }

    if (priority === "high") filter.adminVerifiedRequired = true;
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

    const [requests, total, slaBreaches, highPriority, avgResult] =
      await Promise.all([
        VerificationRequest.find(filter)
          .sort({ createdAt: 1 }) // oldest first — queue order
          .skip(skip)
          .limit(parseInt(limit)),
        VerificationRequest.countDocuments(filter),
        VerificationRequest.countDocuments({
          status: "pending",
          createdAt: { $lt: h72 },
        }),
        VerificationRequest.countDocuments({
          status: "pending",
          adminVerifiedRequired: true,
        }),
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
        pendingTotal: await VerificationRequest.countDocuments({
          status: "pending",
        }),
        highPriority,
        slaBreaches,
        avgTimeToVerify,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/admin/pending-requests
async function listPendingRequests(req, res) {
  try {
    const { requestType, status, q, page = 1, limit = 50 } = req.query;

    const filter = {};
    filter.status = status || "pending";

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

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [requests, total, claimCount, verifyCount] = await Promise.all([
      VerificationRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      VerificationRequest.countDocuments(filter),
      VerificationRequest.countDocuments({
        status: "pending",
        claimRequested: true,
      }),
      VerificationRequest.countDocuments({
        status: "pending",
        verifyRequested: true,
      }),
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
      stats: {
        openRequests: await VerificationRequest.countDocuments({
          status: "pending",
        }),
        claimBusiness: claimCount,
        verifyBusiness: verifyCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/admin/audit-log?targetType=&targetId=&page=
async function listAuditLog(req, res) {
  try {
    const { targetType, targetId, actorId, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (targetType) filter.targetType = targetType;
    if (targetId) filter.targetId = targetId;
    if (actorId) filter.actor = actorId;

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

module.exports = {
  listUsers,
  toggleUserStatus,
  listVerificationHistory,
  // Phase 2 additions
  listRetailers,
  listCanojaVerified,
  listPendingVerifications,
  listPendingRequests,
  listAuditLog,
  revokeVerifiedBadge,
};
