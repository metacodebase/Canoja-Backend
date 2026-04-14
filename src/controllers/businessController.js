const LicenseRecord = require("../models/licenseRecord");
const VerificationRequest = require("../models/verificationRequest");
const BusinessView = require("../models/businessView");
const AnalyticsEvent = require("../models/analyticsEvent");
const { uploadToS3 } = require("../utils/s3Upload");
const User = require("../models/user");
const PasswordResetOTP = require("../models/passwordResetOTP");
const { sendEmailChangeOTP } = require("../utils/emailService");

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// --- Helper: resolve the active business for an operator ---
// Checks for X-Active-Business header so operators with multiple businesses
// can specify which one they're managing. Falls back to the first claimed.
async function getActiveBusiness(userId, req, select) {
  const businessId = req.headers["x-active-business"];
  const query = { claimedBy: userId, claimed: true };
  if (businessId) {
    query._id = businessId;
  }
  const q = LicenseRecord.findOne(query);
  if (select) q.select(select);
  return q;
}

// --- Get Business Dashboard Data ---
async function getBusinessDashboard(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Find the active business for this user
    const business = await getActiveBusiness(userId, req);

    if (!business) {
      return res.status(404).json({
        success: false,
        error: "No business found for this user",
      });
    }

    // Get verification status
    let verificationStatus = "pending_review";
    let verificationMessage = "Pending Review";

    if (business.canojaVerified) {
      verificationStatus = "verified";
      verificationMessage = "Verified";
    } else {
      // Check if there's a pending verification request
      const pendingRequest = await VerificationRequest.findOne({
        pharmacyId: business._id.toString(),
        status: "pending",
      });

      if (pendingRequest) {
        verificationStatus = "pending_review";
        verificationMessage = "Pending Review";
      } else if (business.claimed && !business.canojaVerified) {
        verificationStatus = "not_verified";
        verificationMessage = "Not Verified";
      }
    }

    // Determine visibility status
    const visibilityStatus =
      business.visibility !== false ? "visible" : "hidden";
    const visibilityMessage =
      business.visibility !== false ? "Visible" : "Hidden";

    // Check if menu exists
    const hasMenu = !!business.menu;
    const menuStatus = hasMenu ? "uploaded" : "no_menu";
    const menuMessage = hasMenu ? "Menu uploaded" : "No menu";

    // Get engagement stats (view count)
    const engagementCount = business.view_count || 0;

    // Build dashboard response
    const dashboard = {
      business_health: {
        verification: {
          status: verificationStatus,
          message: verificationMessage,
        },
        visibility: {
          status: visibilityStatus,
          message: visibilityMessage,
        },
        menu_freshness: {
          status: menuStatus,
          message: menuMessage,
          uploaded_at: business.menuUploadedAt || null,
        },
        engagement: {
          count: engagementCount,
          message:
            engagementCount > 0 ? `${engagementCount} views this week` : "-",
        },
      },
      business_id: business._id,
      business_name: business.business_name,
      menu_url: business.menu || null,
      spotlight: business.featured || false,
    };

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    console.error("Error fetching business dashboard:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch business dashboard",
      details: error.message,
    });
  }
}

// --- Get Business Location ---
async function getBusinessLocation(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const business = await getActiveBusiness(
      userId,
      req,
      "business_address city stateName postal_code country location latitude longitude",
    );

    if (!business) {
      return res.status(404).json({
        success: false,
        error: "No business found for this user",
      });
    }

    const [lng, lat] = business.location?.coordinates || [
      business.longitude,
      business.latitude,
    ];

    res.json({
      success: true,
      data: {
        address: business.business_address,
        city: business.city,
        state: business.stateName,
        postal_code: business.postal_code,
        country: business.country,
        coordinates: {
          lat: lat || business.latitude,
          lng: lng || business.longitude,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching business location:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch business location",
      details: error.message,
    });
  }
}

// --- Get Business Profile Information ---
async function getBusinessProfile(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const business = await getActiveBusiness(
      userId,
      req,
      "business_name dba business_address business_phone_number contact_information website_or_social_media_link working_hours business_status description about",
    );

    if (!business) {
      return res.status(404).json({
        success: false,
        error: "No business found for this user",
      });
    }

    const user = await User.findById(userId).select("email");

    res.json({
      success: true,
      data: {
        business_name: business.business_name,
        dba: business.dba,
        address: business.business_address,
        phone:
          business.contact_information?.phone || business.business_phone_number,
        // scraped public email — read-only, shown on detail screen
        scraped_email: business.contact_information?.email,
        // operator's personal login email — editable, never shown publicly
        login_email: user?.email || "",
        website:
          business.contact_information?.website ||
          business.website_or_social_media_link,
        working_hours: business.working_hours,
        business_status: business.business_status,
        description: business.description,
        about: business.about,
      },
    });
  } catch (error) {
    console.error("Error fetching business profile:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch business profile",
      details: error.message,
    });
  }
}

// --- Update Business Profile Information ---
async function updateBusinessProfile(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const business = await getActiveBusiness(userId, req);

    if (!business) {
      return res.status(404).json({
        success: false,
        error: "No business found for this user",
      });
    }

    const {
      business_name,
      dba,
      address,
      phone,
      email,
      website,
      working_hours,
      business_status,
      description,
      about,
    } = req.body;

    // Build update object
    const updateFields = {};

    if (business_name !== undefined) updateFields.business_name = business_name;
    if (dba !== undefined) updateFields.dba = dba;
    if (address !== undefined) updateFields.business_address = address;
    if (phone !== undefined) {
      updateFields["contact_information.phone"] = phone;
      updateFields.business_phone_number = phone;
    }
    // Email cannot be updated through this endpoint for security reasons
    // if (email !== undefined) updateFields["contact_information.email"] = email;
    if (website !== undefined) {
      updateFields["contact_information.website"] = website;
      updateFields.website_or_social_media_link = website;
    }
    if (working_hours !== undefined) updateFields.working_hours = working_hours;
    if (business_status !== undefined)
      updateFields.business_status = business_status;
    if (description !== undefined) updateFields.description = description;
    if (about !== undefined) updateFields.about = about;

    await LicenseRecord.findByIdAndUpdate(business._id, updateFields, {
      new: true,
    });

    res.json({
      success: true,
      message: "Business profile updated successfully",
    });
  } catch (error) {
    console.error("Error updating business profile:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update business profile",
      details: error.message,
    });
  }
}

// --- Toggle Business Visibility ---
async function toggleBusinessVisibility(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const { visibility } = req.body;

    if (typeof visibility !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "Visibility must be a boolean value (true or false)",
      });
    }

    const business = await getActiveBusiness(userId, req);

    if (!business) {
      return res.status(404).json({
        success: false,
        error: "No business found for this user",
      });
    }

    business.visibility = visibility;
    await business.save();

    res.json({
      success: true,
      message: `Business is now ${visibility ? "visible" : "hidden"}`,
      data: {
        visibility: business.visibility,
      },
    });
  } catch (error) {
    console.error("Error toggling business visibility:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update business visibility",
      details: error.message,
    });
  }
}

// --- Upload Menu ---
async function uploadMenu(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const business = await getActiveBusiness(userId, req);

    if (!business) {
      return res.status(404).json({
        success: false,
        error: "No business found for this user",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Menu file is required",
      });
    }

    // File is already uploaded to S3 by multer middleware
    const menuUrl = req.file.location;

    business.menu = menuUrl;
    business.menuUploadedAt = new Date();
    await business.save();

    res.json({
      success: true,
      message: "Menu uploaded successfully",
      data: {
        menu_url: menuUrl,
      },
    });
  } catch (error) {
    console.error("Error uploading menu:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload menu",
      details: error.message,
    });
  }
}

// --- Get Engagement Stats ---
async function getEngagementStats(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const business = await getActiveBusiness(
      userId,
      req,
      "view_count business_name",
    );

    if (!business) {
      return res.status(404).json({
        success: false,
        error: "No business found for this user",
      });
    }

    res.json({
      success: true,
      data: {
        view_count: business.view_count || 0,
        business_name: business.business_name,
      },
    });
  } catch (error) {
    console.error("Error fetching engagement stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch engagement stats",
      details: error.message,
    });
  }
}

// --- Record a profile view (anonymous, one per device per business forever) ---
async function recordView(req, res) {
  const { businessId } = req.params;
  const { device_id } = req.body;

  try {
    if (!businessId || !device_id) {
      return res.status(400).json({
        success: false,
        message: "business_id and device_id are required",
      });
    }

    // insertOne with unique index — if already exists, duplicate key error is thrown and caught
    await BusinessView.create({ business_id: businessId, device_id });

    // Only reaches here if it's a new unique device — increment count
    await LicenseRecord.findByIdAndUpdate(businessId, {
      $inc: { view_count: 1 },
    });

    // Always record a time-series profile_view event (every visit counts for analytics)
    AnalyticsEvent.create({
      business_id: businessId,
      event_type: "profile_view",
    }).catch(() => {});

    console.log(
      `✅ View recorded — business: ${businessId}, device: ${device_id}`,
    );
    return res.status(201).json({ success: true, message: "View recorded" });
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key — device already viewed, still record the time-series event
      AnalyticsEvent.create({
        business_id: businessId,
        event_type: "profile_view",
      }).catch(() => {});
      return res.status(200).json({ success: true, message: "Already viewed" });
    }
    console.error("❌ Error recording view:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to record view" });
  }
}

// --- Record an analytics event (public, no auth) ---
async function recordEvent(req, res) {
  try {
    const { businessId } = req.params;
    const { event_type } = req.body;

    const { VALID_EVENTS } = require("../models/analyticsEvent");

    if (!businessId || !event_type) {
      return res.status(400).json({
        success: false,
        message: "businessId and event_type are required",
      });
    }

    if (!VALID_EVENTS.includes(event_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid event_type. Must be one of: ${VALID_EVENTS.join(", ")}`,
      });
    }

    await AnalyticsEvent.create({ business_id: businessId, event_type });

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("❌ Error recording analytics event:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to record event" });
  }
}

// --- Get analytics for the operator's business ---
async function getAnalytics(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    }

    const period = parseInt(req.query.period) || 30;
    if (![7, 30, 90].includes(period)) {
      return res
        .status(400)
        .json({ success: false, error: "period must be 7, 30, or 90" });
    }

    const business = await getActiveBusiness(userId, req, "_id business_name");

    if (!business) {
      return res
        .status(404)
        .json({ success: false, error: "No business found for this user" });
    }

    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - period);
    currentStart.setHours(0, 0, 0, 0);

    const prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - period);

    // Aggregate current period: total counts per event_type
    const currentTotals = await AnalyticsEvent.aggregate([
      {
        $match: {
          business_id: business._id,
          createdAt: { $gte: currentStart, $lte: now },
        },
      },
      { $group: { _id: "$event_type", count: { $sum: 1 } } },
    ]);

    // Aggregate previous period: total counts per event_type (for % change)
    const prevTotals = await AnalyticsEvent.aggregate([
      {
        $match: {
          business_id: business._id,
          createdAt: { $gte: prevStart, $lt: currentStart },
        },
      },
      { $group: { _id: "$event_type", count: { $sum: 1 } } },
    ]);

    // Daily breakdown for current period
    const dailyBreakdown = await AnalyticsEvent.aggregate([
      {
        $match: {
          business_id: business._id,
          createdAt: { $gte: currentStart, $lte: now },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            event_type: "$event_type",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // Build totals map
    const toMap = (arr) =>
      arr.reduce((acc, { _id, count }) => {
        acc[_id] = count;
        return acc;
      }, {});
    const curr = toMap(currentTotals);
    const prev = toMap(prevTotals);

    const EVENT_TYPES = [
      "profile_view",
      "phone_tap",
      "directions_tap",
      "website_tap",
      "menu_view",
    ];

    const metrics = EVENT_TYPES.map((type) => {
      const current = curr[type] || 0;
      const previous = prev[type] || 0;
      const change =
        previous === 0
          ? current > 0
            ? 100
            : 0
          : Math.round(((current - previous) / previous) * 100);
      return { event_type: type, current, previous, change_pct: change };
    });

    // Build a clean daily array: [{ date, profile_view, phone_tap, ... }]
    const dailyMap = {};
    for (const row of dailyBreakdown) {
      const { date, event_type } = row._id;
      if (!dailyMap[date]) dailyMap[date] = { date };
      dailyMap[date][event_type] = row.count;
    }
    const daily = Object.values(dailyMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    res.json({
      success: true,
      data: {
        business_name: business.business_name,
        period,
        metrics,
        daily,
      },
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch analytics",
      details: error.message,
    });
  }
}

// --- Request Email Change (sends OTP to new email) ---
async function requestEmailChange(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const new_email = req.body.new_email?.toLowerCase().trim();

    if (!new_email) {
      return res
        .status(400)
        .json({ success: false, error: "New email is required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(new_email)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid email address" });
    }

    // Check if email is already taken by another user
    const existing = await User.findOne({ email: new_email });
    if (existing && existing._id.toString() !== userId.toString()) {
      return res.status(409).json({
        success: false,
        error: "This email is already in use by another account",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (user.email === new_email) {
      return res.status(400).json({
        success: false,
        error: "New email must be different from your current email",
      });
    }

    // Invalidate existing email change OTPs for this user
    await PasswordResetOTP.updateMany(
      { user_id: userId, purpose: "email_change", used: false },
      { used: true },
    );

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await new PasswordResetOTP({
      email: new_email,
      otp,
      expiresAt,
      purpose: "email_change",
      new_email,
      user_id: userId,
    }).save();

    try {
      await sendEmailChangeOTP(new_email, otp);
    } catch (emailError) {
      console.error("Error sending email change OTP:", emailError);
      return res.status(500).json({
        success: false,
        error: "Failed to send verification email. Please try again.",
      });
    }

    res.json({
      success: true,
      message: "Verification code sent to your new email address.",
    });
  } catch (error) {
    console.error("Request email change error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process email change request",
    });
  }
}

// --- Confirm Email Change (verify OTP and update User.email) ---
async function confirmEmailChange(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, error: "OTP is required" });
    }

    const otpRecord = await PasswordResetOTP.findOne({
      user_id: userId,
      purpose: "email_change",
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        error: "No pending email change found. Please request a new code.",
      });
    }

    if (otpRecord.otp !== otp) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return res
        .status(400)
        .json({ success: false, error: "Invalid verification code" });
    }

    const newEmail = otpRecord.new_email;

    // Double-check email not taken (race condition guard)
    const taken = await User.findOne({ email: newEmail });
    if (taken && taken._id.toString() !== userId.toString()) {
      otpRecord.used = true;
      await otpRecord.save();
      return res.status(409).json({
        success: false,
        error: "This email has been taken by another account",
      });
    }

    await User.findByIdAndUpdate(userId, { email: newEmail });

    otpRecord.used = true;
    await otpRecord.save();

    res.json({
      success: true,
      message: "Email updated successfully",
      new_email: newEmail,
    });
  } catch (error) {
    console.error("Confirm email change error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to confirm email change" });
  }
}

// --- Toggle Spotlight (featured) ---
async function toggleSpotlight(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    }

    const { spotlight } = req.body;
    if (typeof spotlight !== "boolean") {
      return res
        .status(400)
        .json({ success: false, error: "spotlight must be a boolean" });
    }

    const business = await getActiveBusiness(userId, req);
    if (!business) {
      return res
        .status(404)
        .json({ success: false, error: "No business found for this user" });
    }

    business.featured = spotlight;
    await business.save();

    return res.json({
      success: true,
      message: spotlight
        ? "Business added to Spotlight"
        : "Business removed from Spotlight",
      data: { spotlight },
    });
  } catch (error) {
    console.error("toggleSpotlight error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to update spotlight status" });
  }
}

module.exports = {
  getBusinessDashboard,
  getBusinessLocation,
  getBusinessProfile,
  updateBusinessProfile,
  toggleBusinessVisibility,
  toggleSpotlight,
  uploadMenu,
  getEngagementStats,
  recordView,
  recordEvent,
  getAnalytics,
  requestEmailChange,
  confirmEmailChange,
};
