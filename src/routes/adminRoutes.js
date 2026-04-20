const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { adminMiddleware } = require("../middleware/authMiddleware");

// All admin routes require admin auth
router.use(adminMiddleware);

// GET /api/admin/users — list all registered users
router.get("/users", adminController.listUsers);

// PATCH /api/admin/users/:userId/toggle-status — activate / deactivate a user
router.patch("/users/:userId/toggle-status", adminController.toggleUserStatus);

// GET /api/admin/verification-history — all requests (pending/approved/rejected/auto_verified)
// Query params: status, business_type, page, limit
router.get("/verification-history", adminController.listVerificationHistory);

// ─── Phase 2 additions ────────────────────────────────────────────────────────

// GET /api/admin/retailers
// Query params: q, state, licenseStatus, verificationStatus, expirationWindow, page, limit, sort
router.get("/retailers", adminController.listRetailers);

// POST /api/admin/retailers
router.post("/retailers", adminController.createRetailer);

// GET /api/admin/canoja-verified
// Query params: q, status (active|expiringSoon|revoked), region, source, page, limit
router.get("/canoja-verified", adminController.listCanojaVerified);

// POST /api/admin/canoja-verified/issue
router.post("/canoja-verified/issue", adminController.issueVerification);

// PATCH /api/admin/canoja-verified/:id/revoke
router.patch(
  "/canoja-verified/:id/revoke",
  adminController.revokeVerifiedBadge,
);

// PATCH /api/admin/canoja-verified/:id/renew
router.patch("/canoja-verified/:id/renew", adminController.renewCanojaVerified);

// GET /POST /api/admin/requests/:id/messages
router.get("/requests/:id/messages", adminController.listRequestMessages);
router.post("/requests/:id/messages", adminController.createRequestMessage);

// GET /api/admin/pending-verifications
// Query params: q, region, submissionAge (lt24|24-72|gt72), page, limit
router.get("/pending-verifications", adminController.listPendingVerifications);

// PATCH /api/admin/pending-verifications/:id/escalate
router.patch(
  "/pending-verifications/:id/escalate",
  adminController.escalatePendingVerification,
);

// GET /api/admin/pending-requests
// Query params: requestType (claim|verify), status, page, limit
router.get("/pending-requests", adminController.listPendingRequests);

// POST /api/admin/pending-requests — admin creates a new request manually
router.post("/pending-requests", adminController.createPendingRequest);

// GET /api/admin/audit-log
// Query params: targetType, targetId, actorId, page, limit
router.get("/audit-log", adminController.listAuditLog);

module.exports = router;
