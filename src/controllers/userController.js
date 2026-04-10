const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const LicenseRecord = require("../models/licenseRecord");
const PasswordResetOTP = require("../models/passwordResetOTP");
const { sendPasswordResetOTP } = require("../utils/emailService");

// Token Generation Utilities
// Generate access token (30 days expiration)
const generateAccessToken = (userId, email, role) => {
  return jwt.sign({ userId, email, role }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// Generate refresh token (60 days expiration)
const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "60d",
  });
};

// Register user
const registerUser = async (req, res) => {
  try {
    const { name, password } = req.body;
    const email = req.body.email?.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "User already exists with this email",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = new User({
      name,
      email,
      password: hashedPassword,
    });

    await user.save();

    // Generate access and refresh tokens
    const accessToken = generateAccessToken(user._id, user.email, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token to database
    user.refreshToken = refreshToken;
    user.refreshTokenExpiresAt = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000,
    ); // 60 days
    await user.save();

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token: accessToken,
      refreshToken: refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to register user",
    });
  }
};

// Login user
const loginUser = async (req, res) => {
  try {
    const { password } = req.body;
    const email = req.body.email?.toLowerCase().trim();

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    // Check if user is deactivated
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DEACTIVATED",
        error: "Your account has been deactivated.",
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    // Generate access and refresh tokens
    const accessToken = generateAccessToken(user._id, user.email, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token to database
    user.refreshToken = refreshToken;
    user.refreshTokenExpiresAt = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000,
    ); // 60 days
    await user.save();

    // Fetch all linked businesses for operators
    let businesses = [];
    if (user.role === "operator" && user.licenseRecords?.length > 0) {
      businesses = await LicenseRecord.find(
        { _id: { $in: user.licenseRecords } },
        {
          business_name: 1,
          claimed: 1,
          canojaVerified: 1,
          license_type: 1,
          city: 1,
          stateName: 1,
        },
      ).lean();
    }

    res.json({
      success: true,
      message: "Login successful",
      token: accessToken,
      refreshToken: refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        requiresPasswordChange: user.requiresPasswordChange || false,
        businesses,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to login",
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id || req.user._id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters long",
      });
    }

    // Find user with password field (authMiddleware excludes it, so we need to fetch again)
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: "Current password is incorrect",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    user.password = hashedPassword;
    // Clear the requiresPasswordChange flag after successful password change
    user.requiresPasswordChange = false;
    await user.save();

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to change password",
    });
  }
};

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Request password reset (sends OTP)
const requestPasswordReset = async (req, res) => {
  try {
    const email = req.body.email?.toLowerCase().trim();

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "No account found with this email address.",
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate any existing unused OTPs for this email
    await PasswordResetOTP.updateMany({ email, used: false }, { used: true });

    // Create new OTP record
    const otpRecord = new PasswordResetOTP({
      email,
      otp,
      expiresAt,
    });

    await otpRecord.save();

    // Send OTP email
    try {
      await sendPasswordResetOTP(email, otp);
    } catch (emailError) {
      console.error("Error sending OTP email:", emailError);
      // Still return success to not reveal if email exists
      return res.json({
        success: true,
        message: "If an account exists with this email, an OTP has been sent.",
      });
    }

    res.json({
      success: true,
      message: "OTP has been sent to your email address.",
    });
  } catch (error) {
    console.error("Request password reset error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process password reset request",
    });
  }
};

// Verify OTP only (without resetting password)
const verifyOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    const email = req.body.email?.toLowerCase().trim();

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        error: "Email and OTP are required",
      });
    }

    // Find valid OTP
    const otpRecord = await PasswordResetOTP.findOne({
      email,
      otp,
      used: false,
      expiresAt: { $gt: new Date() }, // Not expired
    });

    if (!otpRecord) {
      // Increment attempts if OTP record exists but is invalid
      await PasswordResetOTP.updateOne(
        { email, otp, used: false },
        { $inc: { attempts: 1 } },
      );

      return res.status(400).json({
        success: false,
        error: "Invalid or expired OTP",
      });
    }

    // Check if too many attempts
    if (otpRecord.attempts >= 5) {
      return res.status(400).json({
        success: false,
        error: "Too many failed attempts. Please request a new OTP.",
      });
    }

    // OTP is valid (but don't mark as used yet - that happens when password is reset)
    res.json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify OTP",
    });
  }
};

// Verify OTP and reset password
const verifyOTPAndResetPassword = async (req, res) => {
  try {
    const { otp, newPassword } = req.body;
    const email = req.body.email?.toLowerCase().trim();

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Email, OTP, and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters long",
      });
    }

    // Find valid OTP
    const otpRecord = await PasswordResetOTP.findOne({
      email,
      otp,
      used: false,
      expiresAt: { $gt: new Date() }, // Not expired
    });

    if (!otpRecord) {
      // Increment attempts if OTP record exists but is invalid
      await PasswordResetOTP.updateOne(
        { email, otp, used: false },
        { $inc: { attempts: 1 } },
      );

      return res.status(400).json({
        success: false,
        error: "Invalid or expired OTP",
      });
    }

    // Check if too many attempts
    if (otpRecord.attempts >= 5) {
      return res.status(400).json({
        success: false,
        error: "Too many failed attempts. Please request a new OTP.",
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password
    user.password = hashedPassword;
    // Clear requiresPasswordChange flag since they're resetting password
    user.requiresPasswordChange = false;
    await user.save();

    // Mark OTP as used
    otpRecord.used = true;
    await otpRecord.save();

    res.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    console.error("Verify OTP and reset password error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset password",
    });
  }
};

// Refresh access token
const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: "Refresh token is required",
      });
    }

    // Verify refresh token signature
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired refresh token",
      });
    }

    // Find user and validate stored refresh token
    const user = await User.findById(decoded.userId);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        error: "Invalid refresh token",
      });
    }

    // Check if refresh token is expired
    if (user.refreshTokenExpiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        error: "Refresh token has expired",
      });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user._id, user.email, user.role);

    // Generate NEW refresh token (rotating refresh tokens)
    const newRefreshToken = generateRefreshToken(user._id);

    // Update database with new refresh token and expiry
    user.refreshToken = newRefreshToken;
    user.refreshTokenExpiresAt = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000,
    ); // 60 days
    await user.save();

    res.json({
      success: true,
      token: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        requiresPasswordChange: user.requiresPasswordChange || false,
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to refresh token",
    });
  }
};

// Logout user
const logoutUser = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    // Clear refresh token from database
    await User.findByIdAndUpdate(userId, {
      refreshToken: null,
      refreshTokenExpiresAt: null,
    });

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to logout",
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  changePassword,
  requestPasswordReset,
  verifyOTP,
  verifyOTPAndResetPassword,
  refreshAccessToken,
  logoutUser,
};
