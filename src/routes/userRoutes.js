const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  changePassword,
  requestPasswordReset,
  verifyOTP,
  verifyOTPAndResetPassword,
  refreshAccessToken,
  logoutUser,
  getUserProfile,
} = require("../controllers/userController");
const {
  handleChangePasswordDeepLink,
} = require("../controllers/deepLinkController");
const { authMiddleware } = require("../middleware/authMiddleware");

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user with a hashed password and returns a JWT token.
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 example: "john@example.com"
 *               password:
 *                 type: string
 *                 example: "mypassword123"
 *     responses:
 *       201:
 *         description: User registered successfully
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
 *                   example: "User registered successfully"
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "64ff3e3b2f4c3d1b2a8c9f1a"
 *                     name:
 *                       type: string
 *                       example: "John Doe"
 *                     email:
 *                       type: string
 *                       example: "john@example.com"
 *       400:
 *         description: User already exists with this email
 *       500:
 *         description: Failed to register user
 */
router.post("/register", registerUser);

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login an existing user
 *     description: Authenticates a user by email and password, then returns a JWT token.
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: "john@example.com"
 *               password:
 *                 type: string
 *                 example: "mypassword123"
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
 *                       example: "64ff3e3b2f4c3d1b2a8c9f1a"
 *                     name:
 *                       type: string
 *                       example: "John Doe"
 *                     email:
 *                       type: string
 *                       example: "john@example.com"
 *       401:
 *         description: Invalid email or password
 *       500:
 *         description: Failed to login
 */
router.post("/login", loginUser);

/**
 * @swagger
 * /api/users/change-password:
 *   post:
 *     summary: Change user password
 *     description: Allows authenticated users to change their password by providing current and new password.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "oldpassword123"
 *               newPassword:
 *                 type: string
 *                 example: "newpassword123"
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid input or password too short
 *       401:
 *         description: Current password is incorrect or unauthorized
 *       500:
 *         description: Failed to change password
 */
router.post("/change-password", authMiddleware, changePassword);

// Deep link redirect route (public - opens app or falls back to TestFlight)
router.get("/deeplink/change-password", handleChangePasswordDeepLink);

// Forgot password routes (public - no authentication required)
router.post("/forgot-password", requestPasswordReset);
router.post("/verify-otp", verifyOTP);
router.post("/reset-password", verifyOTPAndResetPassword);

// Refresh token route (public - no auth required)
router.post("/refresh-token", refreshAccessToken);

// Get current user profile — full user doc minus sensitive fields + businesses for operators
router.get("/profile", authMiddleware, getUserProfile);

// Logout route (requires authentication)
router.post("/logout", authMiddleware, logoutUser);

module.exports = router;
