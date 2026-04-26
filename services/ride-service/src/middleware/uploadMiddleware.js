'use strict';
/**
 * uploadMiddleware.js — multer configuration for chat file attachments
 *
 * Files are stored locally under /tmp/mobo-uploads/<rideId>/ with a unique
 * UUID filename.  In production, swap storageEngine for multer-s3 and set
 * AWS_S3_BUCKET to upload directly to S3 instead.
 *
 * Supported types: images (jpg, png, webp, gif), PDFs, audio (mp3, ogg, wav)
 * Max size: 10 MB
 */

const multer = require('multer');
const path   = require('path');
const crypto = require('crypto');
const fs     = require('fs');

const UPLOAD_DIR  = process.env.UPLOAD_DIR  || '/tmp/mobo-uploads';
const MAX_SIZE_MB = parseInt(process.env.UPLOAD_MAX_MB || '10', 10);

const ALLOWED_TYPES = {
  'image/jpeg':  { ext: '.jpg',  category: 'image'    },
  'image/png':   { ext: '.png',  category: 'image'    },
  'image/webp':  { ext: '.webp', category: 'image'    },
  'image/gif':   { ext: '.gif',  category: 'image'    },
  'application/pdf': { ext: '.pdf', category: 'document' },
  'audio/mpeg':  { ext: '.mp3',  category: 'audio'    },
  'audio/ogg':   { ext: '.ogg',  category: 'audio'    },
  'audio/wav':   { ext: '.wav',  category: 'audio'    },
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOAD_DIR, req.params.id || 'misc');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const mime   = file.mimetype;
    const ext    = ALLOWED_TYPES[mime]?.ext || path.extname(file.originalname) || '';
    const unique = crypto.randomUUID();
    cb(null, `${unique}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE',
      `Unsupported file type: ${file.mimetype}. Allowed: image, pdf, audio.`));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

/** Returns the attachment category ('image' | 'document' | 'audio') for a MIME type */
function getAttachmentType(mimetype) {
  return ALLOWED_TYPES[mimetype]?.category || 'document';
}

/** Build a public URL for the uploaded file */
function buildFileUrl(req, filePath) {
  // If S3 configured, the URL will already be an S3 URL.
  // For local disk: return a relative path that the API serves statically.
  const base = process.env.UPLOAD_BASE_URL || `${req.protocol}://${req.get('host')}/uploads`;
  const rel  = filePath.replace(UPLOAD_DIR, '').replace(/\\/g, '/');
  return `${base}${rel}`;
}

module.exports = { upload, getAttachmentType, buildFileUrl, ALLOWED_TYPES };
