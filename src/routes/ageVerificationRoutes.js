const express = require("express");
const router = express.Router();
const {
  logAgeVerification,
} = require("../controllers/ageVerificationController");

/**
 * @swagger
 * /api/age-verification/log:
 *   post:
 *     summary: Log age verification consent
 *     description: Records that a user confirmed they are of legal age (21+). IP is captured server-side for compliance audit trail.
 *     tags: [Age Verification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - confirmed_age
 *             properties:
 *               confirmed_age:
 *                 type: boolean
 *                 example: true
 *               min_age:
 *                 type: number
 *                 example: 21
 *               platform:
 *                 type: string
 *                 enum: [ios, android]
 *                 example: ios
 *               device_id:
 *                 type: string
 *                 example: "A1B2C3D4-E5F6-..."
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-03-27T10:30:00Z"
 *     responses:
 *       201:
 *         description: Age verification logged successfully
 *       500:
 *         description: Internal server error
 */
router.post("/log", logAgeVerification);

module.exports = router;
