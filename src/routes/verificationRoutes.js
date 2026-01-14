const express = require("express");
const router = express.Router();
const verificationController = require("../controllers/verificationController");
const { uploadFields } = require("../controllers/verificationController");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");

/**
 * @swagger
 * /api/verification-requests/claim:
 *   post:
 *     summary: Submit a business claim request
 *     description: |
 *       Allows a logged-in user to claim a business by submitting verification details,
 *       license information, and uploading supporting documents (PDF, DOC, Images).
 *       This will store files in S3 and save their URLs in the database.
 *     tags:
 *       - Verification
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - pharmacyId
 *               - legal_business_name
 *               - physical_address
 *               - business_phone_number
 *               - contact_person
 *               - license_information
 *             properties:
 *               pharmacyId:
 *                 type: string
 *                 example: "64ff3e3b2f4c3d1b2a8c9f1a"
 *               legal_business_name:
 *                 type: string
 *                 example: "Green Leaf Dispensary"
 *               physical_address:
 *                 type: string
 *                 example: "123 Main St, Springfield, IL"
 *               business_phone_number:
 *                 type: string
 *                 example: "+1-555-123-4567"
 *               website_or_social_media_link:
 *                 type: string
 *                 example: "https://greenleaf.com"
 *               contact_person:
 *                 type: string
 *                 description: JSON string for contact person details
 *                 example: '{"full_name":"John Doe","email_address":"john@example.com","phone_number":"+1-555-123-4567","role_or_position":"Owner"}'
 *               license_information:
 *                 type: string
 *                 description: JSON string for license details
 *                 example: '{"license_number":"LIC-12345","issuing_authority":"State Board","license_type":"Retail Cannabis","expiration_date":"2025-12-31","jurisdiction":"Illinois"}'
 *               gps_coordinates:
 *                 type: string
 *                 description: JSON string for coordinates
 *                 example: '{"latitude":40.7128,"longitude":-74.0060}'
 *               state_license_document:
 *                 type: string
 *                 format: binary
 *                 description: Upload PDF/DOC/Image for state license
 *               utility_bill:
 *                 type: string
 *                 format: binary
 *                 description: Upload PDF/DOC/Image for utility bill
 *               government_issued_id_document:
 *                 type: string
 *                 format: binary
 *                 description: Upload PDF/DOC/Image for government-issued ID
 *     responses:
 *       200:
 *         description: Claim request submitted successfully
 *       400:
 *         description: Missing required fields or duplicate pending claim
 *       500:
 *         description: Failed to create claim request
 */

// Public claim endpoint (no authentication required)
// Supports both multipart/form-data (with file uploads) and application/json (without files)
router.post(
  "/claim",
  (req, res, next) => {
    // Only apply file upload middleware if Content-Type is multipart/form-data
    if (req.is("multipart/form-data")) {
      return uploadFields(req, res, next);
    }
    // Skip file upload middleware for JSON requests
    next();
  },
  verificationController.createClaimRequest,
);

/**
 * @swagger
 * /api/verification-requests/admin/pending:
 *   get:
 *     summary: Get all pending verification requests
 *     description: Returns a list of all pending verification/claim requests for admin review.
 *     tags:
 *       - Verification
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending requests
 *       500:
 *         description: Failed to fetch pending requests
 */
router.get(
  "/admin/pending",
  adminMiddleware,
  verificationController.getAdminPendingRequests,
);

/**
 * @swagger
 * /api/verification-requests/{requestId}/approve:
 *   post:
 *     summary: Approve a verification request
 *     description: Admin approves a pending claim/verification request and updates user role + license record.
 *     tags:
 *       - Verification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *         example: "64ff3e3b2f4c3d1b2a8c9f1a"
 *     responses:
 *       200:
 *         description: Request approved successfully
 *       404:
 *         description: Request not found
 *       500:
 *         description: Failed to approve request
 */
router.post(
  "/:requestId/approve",
  adminMiddleware,
  verificationController.approveRequest,
);

/**
 * @swagger
 * /api/verification-requests/{requestId}/reject:
 *   post:
 *     summary: Reject a verification request
 *     description: Admin rejects a pending claim/verification request and adds a reason.
 *     tags:
 *       - Verification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *         example: "64ff3e3b2f4c3d1b2a8c9f1a"
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Documents were incomplete"
 *     responses:
 *       200:
 *         description: Request rejected successfully
 *       404:
 *         description: Request not found
 *       500:
 *         description: Failed to reject request
 */
router.post(
  "/:requestId/reject",
  adminMiddleware,
  verificationController.rejectRequest,
);

module.exports = router;
