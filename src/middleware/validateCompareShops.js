const { body, validationResult } = require("express-validator");

const validateCompareShops = [
  body("lat")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be a number between -90 and 90"),

  body("lng")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be a number between -180 and 180"),

  body("state")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("State must be a string between 1 and 50 characters"),

  body("city")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("City must be a string between 1 and 100 characters"),

  body("zip")
    .optional()
    .isString()
    .trim()
    .matches(/^\d{5}(-\d{4})?$/)
    .withMessage("Zip code must be in format 12345 or 12345-6789"),

  body("radius")
    .optional()
    .isInt({ min: 1609.34, max: 160934 })
    .withMessage("Radius must be an integer between 1609.34 and 160934 meters"), // 1 mile to 100 miles

  // Check if Google Maps API key is configured
  (req, res, next) => {
    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Google Maps API key not configured",
      });
    }
    next();
  },
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: errors.array(),
    });
  }
  next();
};

module.exports = {
  validateCompareShops,
  handleValidationErrors,
};
