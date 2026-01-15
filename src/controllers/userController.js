const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const PasswordResetOTP = require("../models/passwordResetOTP");
const { sendPasswordResetOTP } = require("../utils/emailService");

// Register user
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

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

    // Generate JWT token (include role in token)
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
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
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
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

    // Generate JWT token (include role in token)
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        requiresPasswordChange: user.requiresPasswordChange || false,
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
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists for security
      return res.json({
        success: true,
        message: "If an account exists with this email, an OTP has been sent.",
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
    const { email, otp } = req.body;

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
    const { email, otp, newPassword } = req.body;

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

module.exports = {
  registerUser,
  loginUser,
  changePassword,
  requestPasswordReset,
  verifyOTP,
  verifyOTPAndResetPassword,
};
