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

// GET /api/admin/canoja-verified
// Query params: q, status (active|expiringSoon|revoked), region, source, page, limit
router.get("/canoja-verified", adminController.listCanojaVerified);

// PATCH /api/admin/canoja-verified/:id/revoke
router.patch(
  "/canoja-verified/:id/revoke",
  adminController.revokeVerifiedBadge,
);

// GET /api/admin/pending-verifications
// Query params: q, region, submissionAge (lt24|24-72|gt72), page, limit
router.get("/pending-verifications", adminController.listPendingVerifications);

// GET /api/admin/pending-requests
// Query params: requestType (claim|verify), status, page, limit
router.get("/pending-requests", adminController.listPendingRequests);

// GET /api/admin/audit-log
// Query params: targetType, targetId, actorId, page, limit
router.get("/audit-log", adminController.listAuditLog);

module.exports = router;
