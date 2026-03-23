'use strict';

/**
 * fieldEncryption.js — AES-256-GCM field-level encryption
 *
 * Encrypts sensitive PII fields before storing in the database.
 * Uses AES-256-GCM (authenticated encryption) — provides both
 * confidentiality and integrity.
 *
 * Encrypted fields in MOBO:
 *   - users.phone_encrypted         (lookup via phone_hash)
 *   - users.date_of_birth_encrypted
 *   - drivers.license_number_encrypted
 *   - payment_methods.phone_encrypted
 *
 * Key hierarchy:
 *   FIELD_ENCRYPTION_KEY env var → 32-byte key (hex or base64)
 *   FIELD_ENCRYPTION_KEY_V2      → next key (for rotation)
 *   FIELD_ENCRYPTION_KEY_VERSION → current version (default: 1)
 *
 * Format: base64(version[1] + iv[12] + authTag[16] + ciphertext)
 */

const crypto = require('crypto');

const ALGORITHM    = 'aes-256-gcm';
const IV_LENGTH    = 12;  // 96-bit IV for GCM
const TAG_LENGTH   = 16;  // 128-bit auth tag
const KEY_VERSION  = parseInt(process.env.FIELD_ENCRYPTION_KEY_VERSION || '1', 10);

function loadKey(envVar) {
  const raw = process.env[envVar];
  if (!raw) return null;
  // Accept hex (64 chars) or base64 (44 chars)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
  } catch {}
  return null;
}

const KEYS = {
  1: loadKey('FIELD_ENCRYPTION_KEY'),
  2: loadKey('FIELD_ENCRYPTION_KEY_V2'),
};

function getActiveKey(version = KEY_VERSION) {
  const key = KEYS[version];
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`[FieldEncryption] FIELD_ENCRYPTION_KEY (v${version}) not configured`);
    }
    // Dev fallback — deterministic key (NOT for production)
    return Buffer.alloc(32, 'mobo_dev_key_placeholder_not_production');
  }
  return key;
}

/**
 * Encrypt a plaintext string.
 * @returns {string} base64-encoded encrypted blob
 */
function encrypt(plaintext, version = KEY_VERSION) {
  if (plaintext === null || plaintext === undefined) return null;
  const key = getActiveKey(version);
  const iv  = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  // Format: version(1 byte) + iv(12) + authTag(16) + ciphertext
  const result = Buffer.alloc(1 + IV_LENGTH + TAG_LENGTH + encrypted.length);
  result.writeUInt8(version, 0);
  iv.copy(result, 1);
  authTag.copy(result, 1 + IV_LENGTH);
  encrypted.copy(result, 1 + IV_LENGTH + TAG_LENGTH);
  return result.toString('base64');
}

/**
 * Decrypt an encrypted blob.
 * @returns {string} plaintext
 */
function decrypt(blob) {
  if (!blob) return null;
  try {
    const buf     = Buffer.from(blob, 'base64');
    const version = buf.readUInt8(0);
    const key     = getActiveKey(version);
    const iv      = buf.slice(1, 1 + IV_LENGTH);
    const authTag = buf.slice(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
    const ciphertext = buf.slice(1 + IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  } catch (err) {
    console.error('[FieldEncryption] Decryption failed:', err.message);
    return null;
  }
}

/**
 * Deterministic HMAC-SHA256 hash for indexed lookup of encrypted fields.
 * Use this to search by phone/email without decrypting.
 */
function hashForLookup(value) {
  if (!value) return null;
  const key = process.env.FIELD_LOOKUP_HMAC_KEY || process.env.FIELD_ENCRYPTION_KEY || 'mobo_hmac_dev';
  return crypto.createHmac('sha256', key).update(String(value).toLowerCase().trim()).digest('hex');
}

/**
 * Re-encrypt a blob with the latest key version.
 * Used during key rotation.
 */
function reencrypt(blob) {
  const plaintext = decrypt(blob);
  if (plaintext === null) return null;
  return encrypt(plaintext, KEY_VERSION);
}

module.exports = { encrypt, decrypt, hashForLookup, reencrypt };
