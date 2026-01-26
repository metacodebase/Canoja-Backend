const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3Config");
const path = require("path");

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    key: function (req, file, cb) {
      // Generate unique filename with timestamp
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const fileExtension = path.extname(file.originalname);
      const fileName = `verification_docs/${uniqueSuffix}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        userId: req.user ? req.user.id : "anonymous",
        uploadDate: new Date().toISOString(),
      });
    },
  }),
  fileFilter: function (req, file, cb) {
    // Allowed file extensions
    const allowedExtensions = /\.(jpeg|jpg|png|pdf|doc|docx)$/i;
    const extname = allowedExtensions.test(file.originalname);

    // Allowed MIME types
    const allowedMimeTypes = [
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      // Documents
      "application/pdf",
      "application/msword", // .doc files
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx files
    ];
    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          "Only images (JPEG, PNG) and documents (PDF, DOC, DOCX) are allowed",
        ),
      );
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

module.exports = upload;
