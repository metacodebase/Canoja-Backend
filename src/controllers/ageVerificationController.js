const AgeVerificationLog = require("../models/ageVerificationLog");

const logAgeVerification = async (req, res) => {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip;

    const { confirmed_age, min_age, platform, device_id, timestamp } = req.body;

    const log = await AgeVerificationLog.create({
      ip,
      confirmed_age,
      min_age: min_age || 21,
      platform,
      device_id,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    console.log(`✅ Age verification logged — IP: ${ip}, device: ${device_id}`);

    return res.status(201).json({
      success: true,
      message: "Age verification logged successfully",
      id: log._id,
    });
  } catch (error) {
    console.error("❌ Error logging age verification:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to log age verification",
    });
  }
};

module.exports = { logAgeVerification };
