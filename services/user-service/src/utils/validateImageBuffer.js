'use strict';

/**
 * Magic-byte validation for uploaded image buffers.
 *
 * Checks the actual file content (first 12 bytes) against known image signatures.
 * This cannot be spoofed via HTTP headers — the bytes are the file itself.
 *
 * Supported formats: JPEG, PNG, GIF (87a/89a), WebP, HEIF/HEIC
 *
 * Usage (in controller, after multer populates req.file.buffer):
 *   const { validateImageMagicBytes } = require('../utils/validateImageBuffer');
 *   if (!validateImageMagicBytes(req.file.buffer)) {
 *     return next(new AppError('File content is not a valid image', 400));
 *   }
 */

const MAGIC_BYTES = [
  // JPEG — starts with FF D8 FF
  { offset: 0, bytes: Buffer.from([0xff, 0xd8, 0xff]) },
  // PNG — starts with 89 50 4E 47 0D 0A 1A 0A
  { offset: 0, bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  // GIF87a
  { offset: 0, bytes: Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) },
  // GIF89a
  { offset: 0, bytes: Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) },
  // WebP — "RIFF" at 0, "WEBP" at 8
  { offset: 0, bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]), extra: { offset: 8, bytes: Buffer.from([0x57, 0x45, 0x42, 0x50]) } },
  // HEIF/HEIC — "ftyp" at offset 4
  { offset: 4, bytes: Buffer.from([0x66, 0x74, 0x79, 0x70]) },
];

/**
 * Returns true if the buffer starts with a recognised image magic byte sequence.
 * @param {Buffer} buf
 * @returns {boolean}
 */
function validateImageMagicBytes(buf) {
  if (!buf || buf.length < 12) return false;

  return MAGIC_BYTES.some(({ offset, bytes, extra }) => {
    const slice = buf.slice(offset, offset + bytes.length);
    if (!slice.equals(bytes)) return false;
    // If this format requires a secondary check (e.g. WebP needs "WEBP" at offset 8)
    if (extra) {
      const extraSlice = buf.slice(extra.offset, extra.offset + extra.bytes.length);
      return extraSlice.equals(extra.bytes);
    }
    return true;
  });
}

module.exports = { validateImageMagicBytes };
