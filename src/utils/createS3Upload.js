const multer = require("multer");
const multerS3 = require("multer-s3");
const path = require("path");
const s3 = require("../config/s3Config");

const IMAGE_EXTENSIONS = /\.(jpeg|jpg|png)$/i;
const IMAGE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png"];

/**
 * Creates a multer instance that uploads files to S3.
 *
 * @param {object} options
 * @param {string} options.folder - S3 key prefix (e.g. "menus", "photos")
 * @param {number} options.maxFileSize - Max upload size in bytes
 * @param {boolean} [options.allowPdf=false] - Also allow PDF uploads
 * @param {string} options.label - Human-readable label for error messages
 */
function createS3Upload({ folder, maxFileSize, allowPdf = false, label }) {
  const allowedExtensions = allowPdf
    ? /\.(jpeg|jpg|png|pdf)$/i
    : IMAGE_EXTENSIONS;

  const allowedMimeTypes = allowPdf
    ? [...IMAGE_MIME_TYPES, "application/pdf"]
    : IMAGE_MIME_TYPES;

  const allowedTypesLabel = allowPdf
    ? "images (JPEG, PNG) and PDF files"
    : "images (JPEG, PNG)";

  return multer({
    storage: multerS3({
      s3,
      bucket: process.env.AWS_BUCKET_NAME,
      key(req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const fileExtension = path.extname(file.originalname);
        cb(null, `${folder}/${uniqueSuffix}${fileExtension}`);
      },
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata(req, file, cb) {
        cb(null, {
          fieldName: file.fieldname,
          userId: req.user ? req.user.id : "anonymous",
          uploadDate: new Date().toISOString(),
        });
      },
    }),
    fileFilter(req, file, cb) {
      const extname = allowedExtensions.test(file.originalname);
      const mimetype = allowedMimeTypes.includes(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      }

      cb(
        new Error(`Only ${allowedTypesLabel} are allowed for ${label}`),
      );
    },
    limits: {
      fileSize: maxFileSize,
    },
  });
}

module.exports = { createS3Upload };
