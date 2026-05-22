const express = require("express");
const router = express.Router();
const businessController = require("../controllers/businessController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { createS3Upload } = require("../utils/createS3Upload");

const menuUpload = createS3Upload({
  folder: "menus",
  maxFileSize: 20 * 1024 * 1024,
  allowPdf: true,
  label: "menus",
});

const photoUpload = createS3Upload({
  folder: "photos",
  maxFileSize: 10 * 1024 * 1024,
  allowPdf: false,
  label: "profile photos",
});

/**
 * @route   POST /api/business/:businessId/view
 * @desc    Record a profile view (anonymous, one per device per business forever)
 * @access  Public
 */
router.post("/:businessId/view", businessController.recordView);

/**
 * @route   POST /api/business/:businessId/event
 * @desc    Record an analytics event (phone_tap, directions_tap, website_tap, menu_view)
 * @access  Public
 */
router.post("/:businessId/event", businessController.recordEvent);

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /api/business/dashboard
 * @desc    Get business dashboard data (verification status, visibility, menu, engagement)
 * @access  Private
 */
router.get("/dashboard", businessController.getBusinessDashboard);

/**
 * @route   GET /api/business/location
 * @desc    Get business location information
 * @access  Private
 */
router.get("/location", businessController.getBusinessLocation);

/**
 * @route   GET /api/business/profile
 * @desc    Get business profile information
 * @access  Private
 */
router.get("/profile", businessController.getBusinessProfile);

/**
 * @route   PUT /api/business/profile
 * @desc    Update business profile information
 * @access  Private
 */
router.put("/profile", businessController.updateBusinessProfile);

/**
 * @route   PUT /api/business/visibility
 * @desc    Toggle business visibility (show/hide)
 * @access  Private
 */
router.put("/visibility", businessController.toggleBusinessVisibility);

/**
 * @route   POST /api/business/menu
 * @desc    Upload business menu (PDF or image)
 * @access  Private
 */
router.post("/menu", menuUpload.single("menu"), businessController.uploadMenu);

/**
 * @route   POST /api/business/photo
 * @desc    Upload business profile photo (JPEG or PNG)
 * @access  Private
 */
router.post(
  "/photo",
  photoUpload.single("photo"),
  businessController.uploadPhoto,
);

/**
 * @route   GET /api/business/engagement
 * @desc    Get business engagement stats (view count)
 * @access  Private
 */
router.get("/engagement", businessController.getEngagementStats);

/**
 * @route   GET /api/business/analytics?period=7|30|90
 * @desc    Get analytics for the operator's business
 * @access  Private
 */
router.get("/analytics", businessController.getAnalytics);

/**
 * @route   POST /api/business/request-email-change
 * @desc    Send OTP to new email address to verify ownership before changing
 * @access  Private
 */
router.post("/request-email-change", businessController.requestEmailChange);

/**
 * @route   POST /api/business/confirm-email-change
 * @desc    Verify OTP and update the operator's login email
 * @access  Private
 */
router.post("/confirm-email-change", businessController.confirmEmailChange);

/**
 * @route   PUT /api/business/spotlight
 * @desc    Toggle spotlight (featured) status for the operator's active business
 * @access  Private
 */
router.put("/spotlight", businessController.toggleSpotlight);

module.exports = router;
