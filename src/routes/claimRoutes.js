const express = require("express");
const router = express.Router();
const claimController = require("../controllers/claimController");

/**
 * @swagger
 * /api/claims/initiate:
 *   post:
 *     summary: Initiate a pharmacy claim request
 *     description: |
 *       Allows anyone to initiate a pharmacy claim request without authentication.
 *       Creates a user account if one doesn't exist, generates a JWT token,
 *       and sends login credentials via email.
 *     tags:
 *       - Claims
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
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
 *     responses:
 *       200:
 *         description: Claim request initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Claim request submitted successfully. An email with your login credentials has been sent."
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 data:
 *                   type: object
 *                   properties:
 *                     requestId:
 *                       type: string
 *                     pharmacyId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     isNewUser:
 *                       type: boolean
 *                     userEmail:
 *                       type: string
 *       400:
 *         description: Missing required fields or duplicate pending claim
 *       500:
 *         description: Failed to initiate claim request
 */
router.post("/initiate", claimController.initiateClaim);

/**
 * @swagger
 * /api/claims/login:
 *   post:
 *     summary: Login with license number and password
 *     description: |
 *       Allows operators to login using their license number and the password
 *       that was sent to them via email during the claim initiation process.
 *     tags:
 *       - Claims
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - license_number
 *               - password
 *             properties:
 *               license_number:
 *                 type: string
 *                 example: "LIC-12345"
 *               password:
 *                 type: string
 *                 example: "TEMP123456"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                 verificationRequest:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     businessName:
 *                       type: string
 *       401:
 *         description: Invalid license number or password
 *       500:
 *         description: Failed to login
 */
router.post("/login", claimController.loginWithLicense);

module.exports = router;
