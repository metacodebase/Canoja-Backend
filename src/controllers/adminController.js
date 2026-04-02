const User = require("../models/user");
const VerificationRequest = require("../models/verificationRequest");

async function listUsers(req, res) {
  try {
    const users = await User.find({}, "-password -refreshToken").sort({
      createdAt: -1,
    });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

async function toggleUserStatus(req, res) {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId, "-password -refreshToken");
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    if (user.role === "admin") {
      return res
        .status(400)
        .json({ success: false, error: "Cannot deactivate an admin account" });
    }
    user.isActive = !user.isActive;
    await user.save();
    res.json({
      success: true,
      message: `User ${user.isActive ? "activated" : "deactivated"} successfully`,
      data: { _id: user._id, email: user.email, isActive: user.isActive },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

async function listVerificationHistory(req, res) {
  try {
    const { status, business_type, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (business_type) filter.business_type = business_type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [requests, total] = await Promise.all([
      VerificationRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      VerificationRequest.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  listUsers,
  toggleUserStatus,
  listVerificationHistory,
};
