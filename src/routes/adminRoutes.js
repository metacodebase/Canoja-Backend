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

module.exports = router;
