const LicenseRecord = require("../models/licenseRecord");
const VerificationRequest = require("../models/verificationRequest");
const { uploadToS3 } = require("../utils/s3Upload");

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

    // Find the business claimed by this user
    const business = await LicenseRecord.findOne({
      claimedBy: userId,
      claimed: true,
    });

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

    const business = await LicenseRecord.findOne({
      claimedBy: userId,
      claimed: true,
    }).select(
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

    const business = await LicenseRecord.findOne({
      claimedBy: userId,
      claimed: true,
    }).select(
      "business_name dba business_address business_phone_number contact_information website_or_social_media_link working_hours business_status description about",
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
        business_name: business.business_name,
        dba: business.dba,
        address: business.business_address,
        phone:
          business.contact_information?.phone || business.business_phone_number,
        email: business.contact_information?.email,
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

    const business = await LicenseRecord.findOne({
      claimedBy: userId,
      claimed: true,
    });

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

    const business = await LicenseRecord.findOne({
      claimedBy: userId,
      claimed: true,
    });

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

    const business = await LicenseRecord.findOne({
      claimedBy: userId,
      claimed: true,
    });

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

    const business = await LicenseRecord.findOne({
      claimedBy: userId,
      claimed: true,
    }).select("view_count business_name");

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

module.exports = {
  getBusinessDashboard,
  getBusinessLocation,
  getBusinessProfile,
  updateBusinessProfile,
  toggleBusinessVisibility,
  uploadMenu,
  getEngagementStats,
};
