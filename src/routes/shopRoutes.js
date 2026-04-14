const express = require("express");
const router = express.Router();
const shopController = require("../controllers/shopController");
const {
  validateCompareShops,
  handleValidationErrors,
} = require("../middleware/validateCompareShops");

/**
 * @swagger
 * /api/shops/compare-shops:
 *   post:
 *     summary: Fetch and compare Google Maps shops with database records
 *     tags:
 *       - Shops
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lat:
 *                 type: number
 *                 example: 42.4449498
 *               lng:
 *                 type: number
 *                 example: -71.0288195
 *               radius:
 *                 type: number
 *                 example: 1000
 *     responses:
 *       200:
 *         description: Comparison successful
 *       500:
 *         description: Internal server error
 */
router.post("/compare-shops", shopController.compareShops);

/**
 * @swagger
 * /api/shops/compare-shops/more:
 *   post:
 *     summary: Fetch more shops for an existing search session
 *     tags:
 *       - Shops
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lat:
 *                 type: number
 *                 example: 42.4449498
 *               lng:
 *                 type: number
 *                 example: -71.0288195
 *               radius:
 *                 type: number
 *                 example: 1000
 *               session_key:
 *                 type: string
 *                 example: "42.4449498_-71.0288195_1000"
 *     responses:
 *       200:
 *         description: More shops retrieved successfully
 *       400:
 *         description: Invalid or missing session_key
 *       500:
 *         description: Internal server error
 */
router.post("/compare-shops/more", shopController.getMoreShops);

/**
 * @swagger
 * /api/shops/compare-shops/session/{session_key}:
 *   get:
 *     summary: Get status of a search session
 *     tags:
 *       - Shops
 *     parameters:
 *       - in: path
 *         name: session_key
 *         required: true
 *         schema:
 *           type: string
 *         example: "42.4449498_-71.0288195_1000"
 *     responses:
 *       200:
 *         description: Session status retrieved successfully
 *       404:
 *         description: Session not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/compare-shops/session/:session_key",
  shopController.getSessionStatus,
);

/**
 * @swagger
 * /api/shops/compare-shops/clear-tokens:
 *   post:
 *     summary: Clear pagination tokens and sessions
 *     tags:
 *       - Shops
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lat:
 *                 type: number
 *                 example: 42.4449498
 *               lng:
 *                 type: number
 *                 example: -71.0288195
 *               radius:
 *                 type: number
 *                 example: 1000
 *               session_key:
 *                 type: string
 *                 example: "42.4449498_-71.0288195_1000"
 *     responses:
 *       200:
 *         description: Tokens and sessions cleared successfully
 *       500:
 *         description: Internal server error
 */
router.post(
  "/compare-shops/clear-tokens",
  shopController.clearPaginationTokens,
);

/**
 * @swagger
 * /api/shops/details/{shopId}:
 *   get:
 *     summary: Get details of a specific shop by ID
 *     tags:
 *       - Shops
 *     parameters:
 *       - in: path
 *         name: shopId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the shop (license record) to retrieve
 *         example: 64c1234abcd5678ef9012345
 *     responses:
 *       200:
 *         description: Shop details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Shop (license record) details
 *       400:
 *         description: Shop ID is missing in the request
 *       404:
 *         description: Shop not found for the provided ID
 *       500:
 *         description: Internal server error
 */
router.get("/details/:shopId", shopController.getShopDetails);

/**
 * @swagger
 * /api/shops/test-db:
 *   get:
 *     summary: Test database connection
 *     tags:
 *       - Shops
 *     responses:
 *       200:
 *         description: Database stats retrieved successfully
 *       500:
 *         description: Database error
 */
router.get("/test-db", shopController.testDatabase);

/**
 * @route   GET /api/shops/spotlight
 * @desc    Get featured/spotlight businesses (latest, sorted by rating)
 * @access  Public
 * @query   limit (default 20, max 50), lat, lng (optional, for distance calc)
 */
router.get("/spotlight", shopController.getSpotlightShops);

module.exports = router;
