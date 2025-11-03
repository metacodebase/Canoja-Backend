const nodemailer = require("nodemailer");

// Create transporter for sending emails
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Send operator credentials email
const sendOperatorCredentials = async (
  email,
  licenseNumber,
  temporaryPassword,
  businessName,
) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Canoja - Operator Account Created",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2E7D32;">Welcome to Canoja!</h2>
          
          <p>Your pharmacy claim request for <strong>${businessName}</strong> has been initiated successfully.</p>
          
          <p>We've created an operator account for you. Here are your login credentials:</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>License Number:</strong> ${licenseNumber}</p>
            <p><strong>Temporary Password:</strong> ${temporaryPassword}</p>
          </div>
          
          <p><strong>Important:</strong> Please change your password after your first login for security purposes.</p>
          
          <p>Your claim request is now being processed by our team. You'll receive another email once your claim has been reviewed and approved.</p>
          
          <p>If you have any questions, please contact our support team.</p>
          
          <p>Best regards,<br>The Canoja Team</p>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Email sending failed:", error);
    return { success: false, error: error.message };
  }
};

// Send claim status update email
const sendClaimStatusUpdate = async (email, businessName, status, message) => {
  try {
    const transporter = createTransporter();

    const statusColors = {
      approved: "#4CAF50",
      rejected: "#F44336",
      pending: "#FF9800",
    };

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: `Canoja - Claim Status Update: ${businessName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${statusColors[status] || "#2E7D32"};">Claim Status Update</h2>
          
          <p>Your pharmacy claim request for <strong>${businessName}</strong> has been updated.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Status:</strong> <span style="color: ${statusColors[status] || "#2E7D32"}; text-transform: uppercase;">${status}</span></p>
            <p><strong>Message:</strong> ${message}</p>
          </div>
          
          ${
            status === "approved"
              ? "<p>Congratulations! You can now access your operator dashboard and manage your pharmacy listing.</p>"
              : status === "rejected"
                ? "<p>If you believe this decision was made in error, please contact our support team.</p>"
                : "<p>We'll notify you as soon as there's an update on your claim.</p>"
          }
          
          <p>Best regards,<br>The Canoja Team</p>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("Status update email sent successfully:", result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Status update email sending failed:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendOperatorCredentials,
  sendClaimStatusUpdate,
};
