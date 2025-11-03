const express = require("express");
const router = express.Router();
const regionController = require("../controllers/regionController");

/**
 * @swagger
 * /api/regions:
 *   get:
 *     summary: Get all regions
 *     tags:
 *       - Regions
 *     responses:
 *       200:
 *         description: Regions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       country:
 *                         type: string
 *                       boundaries:
 *                         type: object
 *                       center:
 *                         type: object
 *                       isActive:
 *                         type: boolean
 *       500:
 *         description: Internal server error
 */
router.get("/", regionController.getAllRegions);

/**
 * @swagger
 * /api/regions/{id}:
 *   get:
 *     summary: Get a specific region by ID or code
 *     tags:
 *       - Regions
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Region ID or code
 *         example: "colorado"
 *     responses:
 *       200:
 *         description: Region retrieved successfully
 *       404:
 *         description: Region not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id", regionController.getRegion);

/**
 * @swagger
 * /api/regions/detect/location:
 *   post:
 *     summary: Detect region based on coordinates
 *     tags:
 *       - Regions
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lat:
 *                 type: number
 *                 example: 39.7392
 *               lng:
 *                 type: number
 *                 example: -104.9903
 *             required:
 *               - lat
 *               - lng
 *     responses:
 *       200:
 *         description: Region detected successfully
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
 *                   properties:
 *                     region:
 *                       type: object
 *                     distance_km:
 *                       type: number
 *       404:
 *         description: No region found for the given coordinates
 *       400:
 *         description: Invalid coordinates
 *       500:
 *         description: Internal server error
 */
router.post("/detect/location", regionController.detectRegion);

/**
 * @swagger
 * /api/regions/nearby:
 *   post:
 *     summary: Get nearby regions based on coordinates
 *     tags:
 *       - Regions
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lat:
 *                 type: number
 *                 example: 39.7392
 *               lng:
 *                 type: number
 *                 example: -104.9903
 *               radius_mi:
 *                 type: number
 *                 example: 100
 *             required:
 *               - lat
 *               - lng
 *     responses:
 *       200:
 *         description: Nearby regions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       region:
 *                         type: object
 *                       distance_km:
 *                         type: number
 *       400:
 *         description: Invalid coordinates
 *       500:
 *         description: Internal server error
 */
router.post("/nearby", regionController.getNearbyRegions);

/**
 * @swagger
 * /api/regions:
 *   post:
 *     summary: Create a new region
 *     tags:
 *       - Regions
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Colorado"
 *               code:
 *                 type: string
 *                 example: "colorado"
 *               country:
 *                 type: string
 *                 example: "United States"
 *               boundaries:
 *                 type: object
 *                 properties:
 *                   north:
 *                     type: number
 *                   south:
 *                     type: number
 *                   east:
 *                     type: number
 *                   west:
 *                     type: number
 *               center:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *               shopCollection:
                 type: string
                 example: "All_Shops"
 *             required:
 *               - name
 *               - code
 *               - boundaries
 *               - center
 *               - shopCollection
 *     responses:
 *       201:
 *         description: Region created successfully
 *       400:
 *         description: Invalid input data
 *       409:
 *         description: Region with this code already exists
 *       500:
 *         description: Internal server error
 */
router.post("/", regionController.createRegion);

/**
 * @swagger
 * /api/regions/{id}:
 *   put:
 *     summary: Update a region
 *     tags:
 *       - Regions
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Region ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               boundaries:
 *                 type: object
 *               center:
 *                 type: object
 *               isActive:
 *                 type: boolean
 *               description:
 *                 type: string
 *                 description: Region description
 *     responses:
 *       200:
 *         description: Region updated successfully
 *       404:
 *         description: Region not found
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Internal server error
 */
router.put("/:id", regionController.updateRegion);

module.exports = router;
