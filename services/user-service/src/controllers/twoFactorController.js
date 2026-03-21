/**
 * twoFactorController.js
 * Admin Two-Factor Authentication (TOTP) via Google Authenticator
 *
 * Routes:
 *   GET    /auth/2fa/status   — get2FAStatus  (admin, authenticated)
 *   POST   /auth/2fa/setup    — setup2FA       (admin, authenticated)
 *   POST   /auth/2fa/verify   — verify2FA      (admin, authenticated)
 *   POST   /auth/2fa/validate — validate2FA    (public, pre-login)
 *   DELETE /auth/2fa          — disable2FA     (admin, authenticated)
 */

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const db     = require('../config/database');

// Try to load speakeasy — graceful fallback for environments without it
let speakeasy;
try {
  speakeasy = require('speakeasy');
} catch (e) {
  console.warn('[2FA] speakeasy module not installed — 2FA endpoints will return 503 until installed');
  speakeasy = null;
}

const JWT_SECRET    = process.env.JWT_SECRET    || 'mobo_jwt_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return 503 when speakeasy is unavailable so routes fail loudly.
 */
function requireSpeakeasy(res) {
  if (!speakeasy) {
    res.status(503).json({
      success: false,
      message: 'Two-factor authentication module is not available. Install speakeasy package.'
    });
    return false;
  }
  return true;
}

/**
 * Generate n cryptographically random 8-character hex backup codes.
 */
function generateBackupCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    codes.push(crypto.randomBytes(4).toString('hex')); // 4 bytes = 8 hex chars
  }
  return codes;
}

/**
 * SHA-256 hash a string — used to store backup codes securely.
 */
function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /auth/2fa/setup  (admin only)
 * Generates a TOTP secret and persists it (not yet enabled until verified).
 */
const setup2FA = async (req, res) => {
  if (!requireSpeakeasy(res)) return;

  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    // Fetch current user email for the authenticator label
    const userResult = await db.query(
      'SELECT id, email, totp_enabled FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userResult.rows[0];
    const email = user.email || req.user.email || req.user.phone || 'admin';

    // Generate a new TOTP secret
    const secret = speakeasy.generateSecret({
      name: 'MOBO Admin (' + email + ')',
      length: 20
    });

    // Persist the secret (base32 encoded) — NOT yet enabled
    await db.query(
      'UPDATE users SET totp_secret = $1, totp_enabled = false WHERE id = $2',
      [secret.base32, req.user.id]
    );

    return res.json({
      success: true,
      secret: secret.base32,
      otpauth_url: secret.otpauth_url,
      qr_instructions: 'Scan with Google Authenticator'
    });
  } catch (err) {
    console.error('[2FA setup]', err);
    return res.status(500).json({ success: false, message: 'Failed to set up 2FA' });
  }
};

/**
 * POST /auth/2fa/verify  (admin only — completes setup)
 * Body: { token }
 * Verifies the 6-digit code, enables 2FA, and returns one-time backup codes.
 */
const verify2FA = async (req, res) => {
  if (!requireSpeakeasy(res)) return;

  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'token is required' });
    }

    // Fetch stored secret
    const userResult = await db.query(
      'SELECT id, totp_secret FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userResult.rows[0];

    if (!user.totp_secret) {
      return res.status(400).json({
        success: false,
        message: '2FA setup not initiated. Call POST /auth/2fa/setup first.'
      });
    }

    // Verify TOTP code (window: 1 = allow one step before/after for clock drift)
    const valid = speakeasy.totp.verify({
      secret:   user.totp_secret,
      encoding: 'base32',
      token:    String(token),
      window:   1
    });

    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid authenticator code' });
    }

    // Generate 8 backup codes — return plaintext once, store hashes
    const plainCodes   = generateBackupCodes(8);
    const hashedCodes  = plainCodes.map(hashCode);

    await db.query(
      `UPDATE users
       SET totp_enabled = true,
           totp_verified_at = NOW(),
           totp_backup_codes = $1
       WHERE id = $2`,
      [JSON.stringify(hashedCodes), user.id]
    );

    return res.json({
      success: true,
      message: '2FA enabled successfully. Save these backup codes — they will not be shown again.',
      backup_codes: plainCodes
    });
  } catch (err) {
    console.error('[2FA verify]', err);
    return res.status(500).json({ success: false, message: 'Failed to verify 2FA' });
  }
};

/**
 * POST /auth/2fa/validate  (public — called during login flow)
 * Body: { user_id, token }
 * Validates TOTP or backup code; returns full JWT on success.
 */
const validate2FA = async (req, res) => {
  if (!requireSpeakeasy(res)) return;

  try {
    const { user_id, token } = req.body;
    if (!user_id || !token) {
      return res.status(400).json({ success: false, message: 'user_id and token are required' });
    }

    // Fetch user with 2FA data
    const userResult = await db.query(
      `SELECT id, phone, email, role, full_name,
              country, city, language, is_verified, rating, total_rides,
              loyalty_points, wallet_balance, subscription_plan, profile_picture,
              registration_step, registration_completed,
              totp_secret, totp_enabled, totp_backup_codes
       FROM users WHERE id = $1 AND is_active = true AND is_suspended = false`,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userResult.rows[0];

    if (!user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ success: false, message: '2FA is not enabled for this account' });
    }

    let tokenAccepted = false;
    let usedBackupCode = false;
    const tokenStr = String(token).trim().toLowerCase();

    // First try TOTP verification
    const totpValid = speakeasy.totp.verify({
      secret:   user.totp_secret,
      encoding: 'base32',
      token:    tokenStr,
      window:   1
    });

    if (totpValid) {
      tokenAccepted = true;
    } else {
      // Try backup codes — compare hash of submitted token against stored hashes
      const backupCodes = Array.isArray(user.totp_backup_codes)
        ? user.totp_backup_codes
        : JSON.parse(user.totp_backup_codes || '[]');

      const submittedHash = hashCode(tokenStr);
      const codeIndex = backupCodes.indexOf(submittedHash);

      if (codeIndex !== -1) {
        // Valid backup code — remove it so it cannot be reused
        backupCodes.splice(codeIndex, 1);
        await db.query(
          'UPDATE users SET totp_backup_codes = $1 WHERE id = $2',
          [JSON.stringify(backupCodes), user.id]
        );
        tokenAccepted = true;
        usedBackupCode = true;
      }
    }

    if (!tokenAccepted) {
      return res.status(401).json({ success: false, message: 'Invalid or expired code' });
    }

    // Generate full JWT token — same payload as the normal login flow
    const tokenPayload = {
      id:        user.id,
      phone:     user.phone,
      email:     user.email,
      role:      user.role,
      full_name: user.full_name
    };
    const jwtToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.json({
      success: true,
      message: '2FA validated successfully',
      used_backup_code: usedBackupCode,
      data: {
        token: jwtToken,
        user: {
          id:                    user.id,
          full_name:             user.full_name,
          phone:                 user.phone,
          email:                 user.email,
          role:                  user.role,
          country:               user.country,
          city:                  user.city,
          language:              user.language,
          is_verified:           user.is_verified,
          rating:                user.rating,
          total_rides:           user.total_rides,
          loyalty_points:        user.loyalty_points,
          wallet_balance:        user.wallet_balance,
          subscription_plan:     user.subscription_plan,
          profile_picture:       user.profile_picture,
          registration_step:     user.registration_step,
          registration_completed: user.registration_completed
        }
      }
    });
  } catch (err) {
    console.error('[2FA validate]', err);
    return res.status(500).json({ success: false, message: 'Failed to validate 2FA code' });
  }
};

/**
 * DELETE /auth/2fa  (admin only)
 * Body: { token }  — must pass current TOTP before disabling
 */
const disable2FA = async (req, res) => {
  if (!requireSpeakeasy(res)) return;

  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'token is required to disable 2FA' });
    }

    const userResult = await db.query(
      'SELECT id, totp_secret, totp_enabled FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userResult.rows[0];

    if (!user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ success: false, message: '2FA is not enabled' });
    }

    // Verify current TOTP before allowing disable
    const valid = speakeasy.totp.verify({
      secret:   user.totp_secret,
      encoding: 'base32',
      token:    String(token),
      window:   1
    });

    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid authenticator code' });
    }

    // Clear all 2FA fields
    await db.query(
      `UPDATE users
       SET totp_enabled = false,
           totp_secret = NULL,
           totp_verified_at = NULL,
           totp_backup_codes = '[]'
       WHERE id = $1`,
      [user.id]
    );

    return res.json({ success: true, message: '2FA has been disabled' });
  } catch (err) {
    console.error('[2FA disable]', err);
    return res.status(500).json({ success: false, message: 'Failed to disable 2FA' });
  }
};

/**
 * GET /auth/2fa/status  (admin only)
 */
const get2FAStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const userResult = await db.query(
      'SELECT totp_enabled, totp_verified_at, totp_backup_codes FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userResult.rows[0];

    const backupCodes = Array.isArray(user.totp_backup_codes)
      ? user.totp_backup_codes
      : JSON.parse(user.totp_backup_codes || '[]');

    return res.json({
      success: true,
      data: {
        enabled:                user.totp_enabled || false,
        verified_at:            user.totp_verified_at || null,
        backup_codes_remaining: backupCodes.length
      }
    });
  } catch (err) {
    console.error('[2FA status]', err);
    return res.status(500).json({ success: false, message: 'Failed to get 2FA status' });
  }
};

module.exports = {
  setup2FA,
  verify2FA,
  validate2FA,
  disable2FA,
  get2FAStatus
};
