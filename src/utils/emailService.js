const nodemailer = require("nodemailer");

// Create reusable transporter
const createTransporter = () => {
  // Check if email credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.warn(
      "Email credentials not configured. Email functionality disabled.",
    );
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD, // Use App Password for Gmail
    },
  });
};

/**
 * Send verification email to business
 * @param {string} toEmail - Business email address
 * @param {string} businessName - Business name
 * @param {string} password - Optional password for auto-registered account
 * @returns {Promise<Object>} Email send result
 */
const sendVerificationEmail = async (
  toEmail,
  businessName,
  password = null,
) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.log("Email service not configured. Skipping verification email.");
      return { success: false, message: "Email service not configured" };
    }

    // Build email content based on whether password is provided
    const passwordSection = password
      ? `
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1f2937; margin-top: 0;">Your Account Credentials</h3>
            <p style="margin: 10px 0;"><strong>Email:</strong> ${toEmail}</p>
            <p style="margin: 10px 0;"><strong>Password:</strong> <code style="background-color: #ffffff; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${password}</code></p>
            <p style="color: #dc2626; font-size: 14px; margin-top: 15px;"><strong>⚠️ Important:</strong> Please change this password after your first login for security.</p>
          </div>
          <p>You can now log in to your Canoja account and proceed to purchase a subscription plan.</p>
        `
      : `
          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Note:</strong> You already have a Canoja account. Please log in using your existing credentials to access your business dashboard and proceed with subscription purchase.</p>
          </div>
        `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: "Welcome to Canoja - Business Verification",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Welcome to Canoja!</h2>
          <p>Hello,</p>
          <p>Your business <strong>${businessName}</strong> has been verified on Canoja.</p>
          ${passwordSection}
          <p>If you have any questions, please contact our support team.</p>
          <p>Best regards,<br>The Canoja Team</p>
        </div>
      `,
      text: `
        Welcome to Canoja!
        
        Your business ${businessName} has been verified on Canoja.
        
        ${
          password
            ? `Your Account Credentials:
        Email: ${toEmail}
        Password: ${password}
        
        ⚠️ Important: Please change this password after your first login for security.
        
        You can now log in to your Canoja account and proceed to purchase a subscription plan.`
            : `Note: You already have a Canoja account. Please log in using your existing credentials to access your business dashboard and proceed with subscription purchase.`
        }
        
        If you have any questions, please contact our support team.
        
        Best regards,
        The Canoja Team
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Verification email sent:", info.messageId);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw error;
  }
};

/**
 * Send pending review notification email
 * @param {string} toEmail - Business email address
 * @param {string} businessName - Business name
 * @returns {Promise<Object>} Email send result
 */
const sendPendingReviewEmail = async (toEmail, businessName) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.log(
        "Email service not configured. Skipping pending review email.",
      );
      return { success: false, message: "Email service not configured" };
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: "Canoja - Verification Request Received",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Verification Request Received</h2>
          <p>Hello,</p>
          <p>Thank you for submitting a claim request for <strong>${businessName}</strong>.</p>
          <p>Your request is currently under review by our admin team. We will notify you once the review is complete.</p>
          <p>If you have any questions, please contact our support team.</p>
          <p>Best regards,<br>The Canoja Team</p>
        </div>
      `,
      text: `
        Verification Request Received
        
        Thank you for submitting a claim request for ${businessName}.
        
        Your request is currently under review by our admin team. We will notify you once the review is complete.
        
        If you have any questions, please contact our support team.
        
        Best regards,
        The Canoja Team
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Pending review email sent:", info.messageId);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Error sending pending review email:", error);
    throw error;
  }
};

/**
 * Send approval notification email
 * @param {string} toEmail - Business email address
 * @param {string} businessName - Business name
 * @param {string} password - Optional password for auto-registered account
 * @returns {Promise<Object>} Email send result
 */
const sendApprovalEmail = async (toEmail, businessName, password = null) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.log("Email service not configured. Skipping approval email.");
      return { success: false, message: "Email service not configured" };
    }

    // Build email content based on whether password is provided
    const passwordSection = password
      ? `
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1f2937; margin-top: 0;">Your Account Credentials</h3>
            <p style="margin: 10px 0;"><strong>Email:</strong> ${toEmail}</p>
            <p style="margin: 10px 0;"><strong>Password:</strong> <code style="background-color: #ffffff; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${password}</code></p>
            <p style="color: #dc2626; font-size: 14px; margin-top: 15px;"><strong>⚠️ Important:</strong> Please change this password after your first login for security.</p>
          </div>
          <p>You can now log in to your Canoja account and proceed to purchase a subscription plan.</p>
        `
      : `
          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Note:</strong> You already have a Canoja account. Please log in using your existing credentials to access your business dashboard and proceed with subscription purchase.</p>
          </div>
        `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: "Canoja - Verification Approved",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Verification Approved!</h2>
          <p>Hello,</p>
          <p>Great news! Your business <strong>${businessName}</strong> has been verified and approved on Canoja.</p>
          ${passwordSection}
          <p>If you have any questions, please contact our support team.</p>
          <p>Best regards,<br>The Canoja Team</p>
        </div>
      `,
      text: `
        Verification Approved!
        
        Great news! Your business ${businessName} has been verified and approved on Canoja.
        
        ${
          password
            ? `Your Account Credentials:
        Email: ${toEmail}
        Password: ${password}
        
        ⚠️ Important: Please change this password after your first login for security.
        
        You can now log in to your Canoja account and proceed to purchase a subscription plan.`
            : `Note: You already have a Canoja account. Please log in using your existing credentials to access your business dashboard and proceed with subscription purchase.`
        }
        
        If you have any questions, please contact our support team.
        
        Best regards,
        The Canoja Team
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Approval email sent:", info.messageId);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Error sending approval email:", error);
    throw error;
  }
};

/**
 * Send rejection notification email
 * @param {string} toEmail - Business email address
 * @param {string} businessName - Business name
 * @param {string} reason - Rejection reason (optional)
 * @returns {Promise<Object>} Email send result
 */
const sendRejectionEmail = async (toEmail, businessName, reason = null) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.log("Email service not configured. Skipping rejection email.");
      return { success: false, message: "Email service not configured" };
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: "Canoja - Verification Request Update",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ef4444;">Verification Request Update</h2>
          <p>Hello,</p>
          <p>We regret to inform you that your verification request for <strong>${businessName}</strong> could not be approved at this time.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
          <p>If you believe this is an error or have additional information to provide, please contact our support team.</p>
          <p>Best regards,<br>The Canoja Team</p>
        </div>
      `,
      text: `
        Verification Request Update
        
        We regret to inform you that your verification request for ${businessName} could not be approved at this time.
        ${reason ? `\nReason: ${reason}` : ""}
        
        If you believe this is an error or have additional information to provide, please contact our support team.
        
        Best regards,
        The Canoja Team
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Rejection email sent:", info.messageId);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Error sending rejection email:", error);
    throw error;
  }
};

/**
 * Send password reset OTP email
 * @param {string} toEmail - User email address
 * @param {string} otp - One-time password (6 digits)
 * @returns {Promise<Object>} Email send result
 */
const sendPasswordResetOTP = async (toEmail, otp) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.log("Email service not configured. Skipping OTP email.");
      return { success: false, message: "Email service not configured" };
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: "Canoja - Password Reset OTP",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Password Reset Request</h2>
          <p>Hello,</p>
          <p>You have requested to reset your password for your Canoja account.</p>
          <div style="background-color: #f3f4f6; padding: 24px; border-radius: 8px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 12px 0; color: #64748b; font-size: 14px;">Your OTP code is:</p>
            <h1 style="margin: 0; color: #10b981; font-size: 36px; letter-spacing: 8px; font-weight: 700;">${otp}</h1>
            <p style="margin: 12px 0 0 0; color: #dc2626; font-size: 12px;">This code will expire in 10 minutes.</p>
          </div>
          <p style="color: #64748b; font-size: 14px;">If you did not request this password reset, please ignore this email or contact our support team.</p>
          <p>Best regards,<br>The Canoja Team</p>
        </div>
      `,
      text: `
        Password Reset Request
        
        Hello,
        
        You have requested to reset your password for your Canoja account.
        
        Your OTP code is: ${otp}
        
        This code will expire in 10 minutes.
        
        If you did not request this password reset, please ignore this email or contact our support team.
        
        Best regards,
        The Canoja Team
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Password reset OTP email sent:", info.messageId);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Error sending password reset OTP email:", error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPendingReviewEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendPasswordResetOTP,
};
