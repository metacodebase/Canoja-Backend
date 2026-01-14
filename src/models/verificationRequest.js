const mongoose = require("mongoose");

const verificationRequestSchema = new mongoose.Schema(
  {
    pharmacyId: {
      type: String, // Can store both ObjectId strings and Google place_id strings
      required: false, // Optional - can be null for manual verification requests
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminVerifiedRequired: {
      type: Boolean,
      default: false,
    },

    claimRequested: {
      type: Boolean,
      default: false,
    },
    verifyRequested: {
      type: Boolean,
      default: false,
    },

    userId: {
      type: String,
    },
    notes: {
      type: String,
    },

    // Business Type and Verification Method
    business_type: {
      type: String,
      enum: ["smoke_shop", "cannabis_operator"],
    },
    verification_method: {
      type: String,
      enum: ["auto", "manual"],
    },
    verification_email_sent: {
      type: Boolean,
      default: false,
    },
    verification_email_sent_at: {
      type: Date,
    },

    legal_business_name: {
      type: String,
      required: true,
    },
    physical_address: {
      type: String,
      required: true,
    },
    business_phone_number: {
      type: String,
      required: true,
    },
    website_or_social_media_link: {
      type: String,
    },

    contact_person: {
      full_name: {
        type: String,
        required: true,
      },
      email_address: {
        type: String,
        required: true,
      },
      phone_number: {
        type: String,
        required: true,
      },
      role_or_position: {
        type: String,
        required: true,
      },
      government_issued_id_document: {
        type: String, // File path/URL to uploaded document
      },
    },

    license_information: {
      license_number: {
        type: String,
        required: false, // Optional - can be empty for manual verification
        default: "",
      },
      issuing_authority: {
        type: String,
        required: true,
      },
      license_type: {
        type: String,
        required: true,
      },
      expiration_date: {
        type: Date,
        required: true,
      },
      jurisdiction: {
        type: String,
        required: true,
      },
    },

    uploaded_documents: {
      state_license_document: {
        type: String, // File path or URL
      },
      utility_bill: {
        type: String, // File path or URL
      },
    },

    // GPS Validation
    gps_validation_status: {
      type: String,
      enum: ["pending", "validated", "failed"],
      default: "pending",
    },
    gps_coordinates: {
      latitude: Number,
      longitude: Number,
    },

    // Submission metadata
    verification_metadata: {
      ip_address: String,
      user_agent: String,
      submission_timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  },
  {
    timestamps: true,
  },
);

verificationRequestSchema.index({ pharmacyId: 1 });
verificationRequestSchema.index({ status: 1 });
verificationRequestSchema.index({ claim: 1 });
verificationRequestSchema.index({ verify: 1 });
verificationRequestSchema.index({ userId: 1 });
verificationRequestSchema.index({ "contact_person.email_address": 1 });
verificationRequestSchema.index({ "license_information.license_number": 1 });
verificationRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model(
  "VerificationRequest",
  verificationRequestSchema,
);
