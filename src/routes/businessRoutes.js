const express = require("express");
const router = express.Router();
const businessController = require("../controllers/businessController");
const { authMiddleware } = require("../middleware/authMiddleware");
const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3Config");
const path = require("path");

// Multer configuration for menu uploads
const menuUpload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    key: function (req, file, cb) {
      // Generate unique filename with timestamp
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const fileExtension = path.extname(file.originalname);
      const fileName = `menus/${uniqueSuffix}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        userId: req.user ? req.user.id : "anonymous",
        uploadDate: new Date().toISOString(),
      });
    },
  }),
  fileFilter: function (req, file, cb) {
    // Allowed file extensions for menus
    const allowedExtensions = /\.(jpeg|jpg|png|pdf)$/i;
    const extname = allowedExtensions.test(file.originalname);

    // Allowed MIME types
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
    ];
    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          "Only images (JPEG, PNG) and PDF files are allowed for menus",
        ),
      );
    }
  },
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit for menu files
  },
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

module.exports = router;
