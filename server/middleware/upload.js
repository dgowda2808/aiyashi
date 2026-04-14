/**
 * upload.js — Multer config for profile photo uploads
 */
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './public/uploads';

// Ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${req.user.id}_${Date.now()}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG and WebP images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024,
    files: 6,  // max 6 photos per profile
  },
});

module.exports = upload;
