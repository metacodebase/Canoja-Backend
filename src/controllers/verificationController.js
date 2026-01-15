const VerificationRequest = require("../models/verificationRequest");
const LicenseRecord = require("../models/licenseRecord");
const User = require("../models/user");
const upload = require("../utils/s3Upload");
const bcrypt = require("bcryptjs");
const {
  sendVerificationEmail,
  sendPendingReviewEmail,
  sendApprovalEmail,
  sendRejectionEmail,
} = require("../utils/emailService");

/**
 * Generate a random password for auto-registration
 * @returns {string} Random password
 */
const generateDummyPassword = () => {
  const length = 12;
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

/**
 * Auto-register user with email and password
 * @param {string} email - User email
 * @param {string} password - Plain text password (only used for new users)
 * @param {string} licenseRecordId - License record ID to associate
 * @returns {Promise<Object>} Created user object and whether user was newly created
 */
const autoRegisterUser = async (email, password, licenseRecordId = null) => {
  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    // If user exists, update role and add license record if provided
    if (licenseRecordId) {
      existingUser.role = "operator";
      existingUser.licenseRecords = [
        ...new Set([...existingUser.licenseRecords, licenseRecordId]),
      ];
      await existingUser.save();
    }
    return { user: existingUser, isNewUser: false };
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create new user
  const user = new User({
    email,
    password: hashedPassword,
    role: "operator",
    licenseRecords: licenseRecordId ? [licenseRecordId] : [],
    requiresPasswordChange: true, // New users must change password on first login
  });

  await user.save();
  return { user, isNewUser: true };
};

const uploadFields = upload.fields([
  { name: "state_license_document", maxCount: 1 },
  { name: "utility_bill", maxCount: 1 },
  { name: "government_issued_id_document", maxCount: 1 },
]);

const createClaimRequest = async (req, res) => {
  try {
    const {
      legal_business_name,
      physical_address,
      business_phone_number,
      website_or_social_media_link,
      contact_person,
      license_information,
      gps_coordinates,
    } = req.body;

    // userId is optional (public form, user may not be logged in)
    const userId = req.user?.id || null;

    // Parse contact_person and license_information
    // Handle both cases: string (from form-data) or object (from JSON)
    let parsedContactPerson, parsedLicenseInfo;
    try {
      parsedContactPerson =
        typeof contact_person === "string"
          ? JSON.parse(contact_person)
          : contact_person || {};
      parsedLicenseInfo =
        typeof license_information === "string"
          ? JSON.parse(license_information)
          : license_information || {};
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: "Invalid JSON format for contact_person or license_information",
        details: parseError.message,
      });
    }

    // Validate required fields
    if (
      !legal_business_name ||
      !physical_address ||
      !business_phone_number ||
      !parsedContactPerson ||
      !parsedLicenseInfo
    ) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    // Step 1: Match by business name (case-insensitive)
    const businessName = legal_business_name.trim();
    const matchedRecord = await LicenseRecord.findOne({
      $or: [
        { business_name: { $regex: new RegExp(`^${businessName}$`, "i") } },
        { dba: { $regex: new RegExp(`^${businessName}$`, "i") } },
      ],
    });

    if (!matchedRecord) {
      return res.status(404).json({
        success: false,
        error: "Business not found in our database. Please contact support.",
      });
    }

    console.log(
      `Business matched: ${matchedRecord.business_name} (${matchedRecord._id})`,
    );

    // Check if shop is already claimed
    if (matchedRecord.claimed === true) {
      return res.status(400).json({
        success: false,
        error: "This business has already been claimed by another user.",
        data: {
          business_name: matchedRecord.business_name,
          claimed: true,
          claimedAt: matchedRecord.claimedAt,
        },
      });
    }

    // Step 2: Determine business type from matched record's smoke_shop attribute
    const isSmokeShopBusiness = matchedRecord.smoke_shop === true;
    const businessType = isSmokeShopBusiness
      ? "smoke_shop"
      : "cannabis_operator";

    console.log(
      `Business type from DB: ${businessType} (smoke_shop: ${matchedRecord.smoke_shop})`,
    );

    // Step 3: Handle smoke shops - Auto approval
    if (isSmokeShopBusiness) {
      // Generate dummy password and auto-register user
      const dummyPassword = generateDummyPassword();
      const { user, isNewUser } = await autoRegisterUser(
        parsedContactPerson.email_address,
        dummyPassword,
        matchedRecord._id,
      );

      // Update LicenseRecord (don't set canojaVerified if shop is not already verified)
      const updateFields = {
        adminVerificationRequired: false,
        claimed: true,
        claimedBy: user._id,
        claimedAt: new Date(),
      };

      // Only set canojaVerified if shop is already verified
      if (matchedRecord.canojaVerified === true) {
        updateFields.canojaVerified = true;
      }

      // Update contact information
      if (parsedContactPerson.email_address) {
        updateFields["contact_information.email"] =
          parsedContactPerson.email_address;
      }
      if (business_phone_number) {
        updateFields["contact_information.phone"] = business_phone_number;
      }
      if (website_or_social_media_link) {
        updateFields["contact_information.website"] =
          website_or_social_media_link;
      }

      await LicenseRecord.findByIdAndUpdate(matchedRecord._id, updateFields);

      // Send verification email (only include password for new users)
      try {
        await sendVerificationEmail(
          parsedContactPerson.email_address,
          legal_business_name,
          isNewUser ? dummyPassword : null, // Only send password if user is new
        );
        console.log(
          `Verification email sent to ${parsedContactPerson.email_address} (${isNewUser ? "new user" : "existing user"})`,
        );
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
      }

      return res.json({
        success: true,
        message:
          "Your business has been auto-verified. Please check your email for details.",
        data: {
          business_type: "smoke_shop",
          verification_status: "auto_verified",
          license_record_id: matchedRecord._id,
          user_created: isNewUser,
          email_sent: true,
          next_steps: "login_and_subscription",
        },
      });
    }

    // Step 4: Handle cannabis operators - Check license number matching
    const licenseNumber = parsedLicenseInfo.license_number || "";
    const formLicenseNumber = licenseNumber.trim();
    const dbLicenseNumber = matchedRecord.license_number || "";

    // Check if license numbers match
    const licenseMatch =
      formLicenseNumber !== "" &&
      dbLicenseNumber !== "" &&
      formLicenseNumber === dbLicenseNumber;

    // Determine verification status
    let verificationStatus;
    let needsAdminApproval = false;

    if (licenseMatch) {
      // License numbers match - Auto verified
      verificationStatus = "auto_verified";
      needsAdminApproval = false;

      // Generate dummy password and auto-register user
      const dummyPassword = generateDummyPassword();
      const { user, isNewUser } = await autoRegisterUser(
        parsedContactPerson.email_address,
        dummyPassword,
        matchedRecord._id,
      );

      // Update LicenseRecord (don't set canojaVerified if shop is not already verified)
      const updateFields = {
        adminVerificationRequired: false,
        claimed: true,
        claimedBy: user._id,
        claimedAt: new Date(),
      };

      // Only set canojaVerified if shop is already verified
      if (matchedRecord.canojaVerified === true) {
        updateFields.canojaVerified = true;
      }

      // Update contact information
      if (parsedContactPerson.email_address) {
        updateFields["contact_information.email"] =
          parsedContactPerson.email_address;
      }
      if (business_phone_number) {
        updateFields["contact_information.phone"] = business_phone_number;
      }
      if (website_or_social_media_link) {
        updateFields["contact_information.website"] =
          website_or_social_media_link;
      }

      await LicenseRecord.findByIdAndUpdate(matchedRecord._id, updateFields);

      // Send verification email (only include password for new users)
      try {
        await sendVerificationEmail(
          parsedContactPerson.email_address,
          legal_business_name,
          isNewUser ? dummyPassword : null, // Only send password if user is new
        );
        console.log(
          `Verification email sent to ${parsedContactPerson.email_address} (${isNewUser ? "new user" : "existing user"})`,
        );
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
      }

      return res.json({
        success: true,
        message:
          "Your business has been auto-verified. Please check your email for details.",
        data: {
          business_type: "cannabis_operator",
          verification_status: "auto_verified",
          license_record_id: matchedRecord._id,
          license_match: true,
          user_created: isNewUser,
          email_sent: true,
          next_steps: "login_and_subscription",
        },
      });
    } else if (formLicenseNumber !== "" && dbLicenseNumber !== "") {
      // License numbers don't match - Prompt user
      return res.status(400).json({
        success: false,
        error:
          "License number provided does not match our records. Please verify and try again.",
        data: {
          business_type: "cannabis_operator",
          verification_status: "license_mismatch",
          provided_license: formLicenseNumber,
        },
      });
    } else {
      // No license number in form OR in DB - Admin approval required
      verificationStatus = "pending_review";
      needsAdminApproval = true;
    }

    // Step 5: Create manual verification request for admin approval
    if (needsAdminApproval) {
      console.log(
        `No license number match. Creating manual verification request for ${businessName}`,
      );

      // Check for existing pending claim for this business (by license record ID)
      const existingClaim = await VerificationRequest.findOne({
        pharmacyId: matchedRecord._id.toString(),
        status: "pending",
      });

      if (existingClaim) {
        return res.status(400).json({
          success: false,
          error: "A verification request is already pending for this business",
        });
      }

      // Prepare uploaded documents URLs
      // Handle both multipart/form-data (req.files) and JSON (optional file URLs)
      const uploadedDocuments = {};

      // If files were uploaded via multipart/form-data
      if (req.files) {
        if (req.files.state_license_document) {
          uploadedDocuments.state_license_document =
            req.files.state_license_document[0].location;
        }
        if (req.files.utility_bill) {
          uploadedDocuments.utility_bill = req.files.utility_bill[0].location;
        }
      }

      // If files are provided as URLs in JSON (for testing without actual uploads)
      if (req.body.uploaded_documents) {
        if (req.body.uploaded_documents.state_license_document) {
          uploadedDocuments.state_license_document =
            req.body.uploaded_documents.state_license_document;
        }
        if (req.body.uploaded_documents.utility_bill) {
          uploadedDocuments.utility_bill =
            req.body.uploaded_documents.utility_bill;
        }
      }

      // Handle government ID document
      let govIdDocument = null;
      if (req.files && req.files.government_issued_id_document) {
        govIdDocument = req.files.government_issued_id_document[0].location;
      } else if (req.body.uploaded_documents?.government_issued_id_document) {
        govIdDocument =
          req.body.uploaded_documents.government_issued_id_document;
      }

      console.log(
        `Creating manual verification request for cannabis operator: ${legal_business_name}`,
      );

      // Create verification request for manual review (cannabis operator, no license match)
      const verificationRequest = new VerificationRequest({
        pharmacyId: matchedRecord._id.toString(), // Use matched license record ID
        claimRequested: true,
        verifyRequested: true,
        userId: userId,
        adminVerifiedRequired: true,
        business_type: "cannabis_operator",
        verification_method: "manual",
        notes: `Manual verification request for ${legal_business_name}. License number: ${formLicenseNumber || "not provided"}. DB license: ${dbLicenseNumber || "not in DB"}`,

        // Basic Business Information
        legal_business_name,
        physical_address,
        business_phone_number,
        website_or_social_media_link,

        // Contact Person Information
        contact_person: {
          full_name: parsedContactPerson.full_name,
          email_address: parsedContactPerson.email_address,
          phone_number: parsedContactPerson.phone_number,
          role_or_position: parsedContactPerson.role_or_position,
          government_issued_id_document: govIdDocument,
        },

        // License Information
        license_information: {
          license_number: parsedLicenseInfo.license_number,
          issuing_authority: parsedLicenseInfo.issuing_authority,
          license_type: parsedLicenseInfo.license_type,
          expiration_date: parsedLicenseInfo.expiration_date,
          jurisdiction: parsedLicenseInfo.jurisdiction,
        },

        // Document uploads (S3 URLs - unchanged)
        uploaded_documents: uploadedDocuments,

        // GPS coordinates (handle both string and object)
        gps_coordinates: gps_coordinates
          ? typeof gps_coordinates === "string"
            ? JSON.parse(gps_coordinates)
            : gps_coordinates
          : {},

        // Submission metadata
        verification_metadata: {
          ip_address: req.ip,
          user_agent: req.get("User-Agent"),
        },
      });

      await verificationRequest.save();

      // Send pending review email
      try {
        await sendPendingReviewEmail(
          parsedContactPerson.email_address,
          legal_business_name,
        );
        verificationRequest.verification_email_sent = true;
        verificationRequest.verification_email_sent_at = new Date();
        await verificationRequest.save();
        console.log(
          `Pending review email sent to ${parsedContactPerson.email_address}`,
        );
      } catch (emailError) {
        console.error("Failed to send pending review email:", emailError);
        // Continue even if email fails
      }

      // Return response for manual verification (pending admin review)
      res.json({
        success: true,
        message:
          "Your verification request has been submitted and is pending admin review. You will be notified once the review is complete.",
        data: {
          requestId: verificationRequest._id,
          business_type: "cannabis_operator",
          verification_status: "pending_review",
          email_sent: verificationRequest.verification_email_sent,
          status: "pending",
          uploadedFiles: {
            state_license_document:
              uploadedDocuments.state_license_document || null,
            utility_bill: uploadedDocuments.utility_bill || null,
            government_issued_id_document: govIdDocument || null,
          },
        },
      });
    }
  } catch (error) {
    console.error("Create claim request error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create claim request",
      details: error.message,
    });
  }
};

const getAdminPendingRequests = async (req, res) => {
  try {
    const { requestType } = req.query;

    // Only show cannabis operators pending requests (smoke shops are auto-verified)
    let filter = {
      status: "pending",
      business_type: "cannabis_operator", // Filter out smoke shops
    };

    if (requestType === "claim") {
      filter.claimRequested = true;
    } else if (requestType === "verify") {
      filter.verifyRequested = true;
    } else if (requestType === "both") {
      filter.claimRequested = true;
      filter.verifyRequested = true;
    }

    const requests = await VerificationRequest.find(filter).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      requests,
    });
  } catch (error) {
    console.error("Get pending requests error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch pending requests",
    });
  }
};

const approveRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    // Find the request
    const request = await VerificationRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: "Request not found",
      });
    }

    // Update request status
    request.status = "approved";
    request.adminVerifiedRequired = false;

    // Find LicenseRecord by pharmacyId (stored when request was created)
    let licenseRecord = null;
    let licenseRecordId = null;

    if (request.pharmacyId) {
      licenseRecord = await LicenseRecord.findById(request.pharmacyId);
      if (licenseRecord) {
        licenseRecordId = licenseRecord._id;
        console.log(
          `Found LicenseRecord: ${licenseRecord.business_name} (${licenseRecordId})`,
        );
      }
    }

    // Generate dummy password and auto-register user
    const dummyPassword = generateDummyPassword();
    const { user, isNewUser } = await autoRegisterUser(
      request.contact_person.email_address,
      dummyPassword,
      licenseRecordId,
    );

    // Handle LicenseRecord update if found
    if (licenseRecord) {
      console.log(
        `Processing LicenseRecord approval - verifyRequested: ${request.verifyRequested}, claimRequested: ${request.claimRequested}`,
      );

      // Update the license record
      const updateFields = {
        adminVerificationRequired: false,
        claimed: true,
        claimedBy: user._id,
        claimedAt: new Date(),
      };

      // Only set canojaVerified if shop is already verified (don't set it for non-verified shops)
      if (licenseRecord.canojaVerified === true) {
        updateFields.canojaVerified = true;
      }

      // Update contact information if provided
      if (request.contact_person?.email_address) {
        updateFields["contact_information.email"] =
          request.contact_person.email_address;
      }
      if (request.business_phone_number) {
        updateFields["contact_information.phone"] =
          request.business_phone_number;
      }
      if (request.website_or_social_media_link) {
        updateFields["contact_information.website"] =
          request.website_or_social_media_link;
      }

      await LicenseRecord.findByIdAndUpdate(licenseRecordId, updateFields);
    }

    // Send approval email (only include password for new users)
    try {
      await sendApprovalEmail(
        request.contact_person.email_address,
        request.legal_business_name,
        isNewUser ? dummyPassword : null, // Only send password if user is new
      );
      console.log(
        `Approval email sent to ${request.contact_person.email_address} (${isNewUser ? "new user" : "existing user"})`,
      );
    } catch (emailError) {
      console.error("Failed to send approval email:", emailError);
      // Continue even if email fails
    }

    // Mark the specific requests as processed
    if (request.claimRequested) {
      request.claimRequested = false; // Mark as processed
    }
    if (request.verifyRequested) {
      request.verifyRequested = false; // Mark as processed
    }

    await request.save();

    // Build response message
    res.json({
      success: true,
      message: "Request approved successfully. Business verified and claimed.",
      request,
      data: {
        licenseRecordId: licenseRecordId,
        userRoleUpdated: !!request.userId,
        claimProcessed: true,
        verificationProcessed: true,
      },
    });
  } catch (error) {
    console.error("Approve request error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to approve request",
      details: error.message,
    });
  }
};

const rejectRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    const request = await VerificationRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: "Request not found",
      });
    }

    request.status = "rejected";
    if (reason) {
      request.notes = (request.notes || "") + `\nRejection reason: ${reason}`;
    }
    await request.save();

    // Send rejection email
    try {
      await sendRejectionEmail(
        request.contact_person.email_address,
        request.legal_business_name,
        reason || null,
      );
      console.log(
        `Rejection email sent to ${request.contact_person.email_address}`,
      );
    } catch (emailError) {
      console.error("Failed to send rejection email:", emailError);
      // Continue even if email fails
    }

    res.json({
      success: true,
      message: "Request rejected successfully",
      request,
    });
  } catch (error) {
    console.error("Reject request error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reject request",
    });
  }
};

function extractCityFromAddress(address) {
  if (!address) return null;

  const parts = address.split(",");
  if (parts.length >= 2) {
    return parts[parts.length - 2].trim();
  }
  return null;
}

module.exports = {
  createClaimRequest,
  getAdminPendingRequests,
  approveRequest,
  rejectRequest,
  uploadFields,
};
