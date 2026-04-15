const logger = require('../utils/logger');
/**
 * Biometric Driver Verification Controller
 *
 * Integrates with Smile Identity (African KYC leader) for:
 *   1. Face / liveness verification — matches selfie to government ID photo
 *   2. ID document verification — validates national ID, passport, or driver's licence
 *
 * Required env vars:
 *   SMILE_PARTNER_ID      — Your Smile Identity partner ID
 *   SMILE_API_KEY         — Your Smile Identity API key
 *   SMILE_SID_SERVER      — 0 = test sandbox, 1 = production (default 0)
 *
 * Falls back to basic presence validation when Smile credentials are absent
 * (allows local development / CI without real credentials).
 */
const axios  = require('axios');
const crypto = require('crypto');
const db     = require('../config/database');

// Smile Identity REST endpoint (v2)
const SMILE_ENDPOINT = {
  '0': 'https://3eydmgh10d.execute-api.us-west-2.amazonaws.com/test/smile-id/v1.0.0',
  '1': 'https://la7am6gdm8.execute-api.us-west-2.amazonaws.com/prod/v1',
};

/**
 * Build the HMAC-SHA256 signature Smile Identity requires on every request.
 */
function buildSmileSignature(partnerId, apiKey) {
  const timestamp = new Date().toISOString();
  const toSign    = `${timestamp}:${partnerId}:sid_request`;
  const signature = crypto.createHmac('sha256', apiKey).update(toSign).digest('base64');
  return { timestamp, signature };
}

/**
 * POST /drivers/me/biometric-verify
 * Body: {
 *   photo_base64   — selfie (JPEG/PNG, base64, min 10 KB)
 *   id_number      — (optional) government ID number for ID verification
 *   id_type        — (optional) "NATIONAL_ID" | "PASSPORT" | "DRIVERS_LICENSE"
 * }
 */
exports.verifyDriver = async (req, res) => {
  try {
    const driverId = req.user.driver_id || req.user.id;
    const { photo_base64, id_number, id_type = 'NATIONAL_ID' } = req.body;

    if (!photo_base64) {
      return res.status(400).json({ error: 'No photo provided', verified: false });
    }

    const sizeKb = Buffer.byteLength(photo_base64, 'base64') / 1024;
    if (sizeKb < 10) {
      return res.status(400).json({ error: 'Photo too small or corrupted (< 10 KB)', verified: false });
    }

    // Resolve driver record for the user
    const driverRow = await db.query(
      'SELECT id FROM drivers WHERE user_id = $1',
      [driverId]
    ).catch(() => ({ rows: [] }));
    const resolvedDriverId = driverRow.rows[0]?.id || driverId;

    const partnerId = process.env.SMILE_PARTNER_ID;
    const apiKey    = process.env.SMILE_API_KEY;
    const server    = process.env.SMILE_SID_SERVER || '0';
    const baseUrl   = SMILE_ENDPOINT[server] || SMILE_ENDPOINT['0'];

    let result = 'verified';
    let jobId  = null;
    let resultCode = null;
    let confidence = null;
    let rawResponse = null;

    if (partnerId && apiKey) {
      // ── Real Smile Identity verification ──────────────────────────────────
      try {
        const { timestamp, signature } = buildSmileSignature(partnerId, apiKey);

        const payload = {
          partner_id:     partnerId,
          timestamp,
          signature,
          smile_client_id: `MOBO-DRIVER-${resolvedDriverId}`,
          source_sdk:       'rest_api',
          source_sdk_version: '1.0.0',
          job_type:         4,   // Job type 4 = Enhanced Document Verification + Selfie
          images: [
            {
              image_type_id: 0, // selfie (JPEG)
              image: photo_base64,
            },
          ],
          ...(id_number ? {
            id_info: {
              country:  'CM',
              id_type:  id_type,
              id_number: id_number,
            }
          } : {}),
          options: {
            return_job_status:        true,
            return_history:           false,
            return_image_links:       false,
            use_enrolled_image:       false,
          },
        };

        const { data } = await axios.post(
          `${baseUrl}/upload`,
          payload,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000,
          }
        );

        rawResponse = data;
        jobId       = data.smile_job_id || data.job_id || null;

        // Smile returns result synchronously when return_job_status = true
        const jobResult = data.result || {};
        resultCode      = jobResult.ResultCode || null;
        confidence      = jobResult.ConfidenceValue
                            ? parseFloat(jobResult.ConfidenceValue)
                            : null;

        // Result codes: 0810 = Exact match, 0811 = Partial match, 0812 = No match
        if (['0810', '0811'].includes(resultCode)) {
          result = 'verified';
        } else if (resultCode === '0812') {
          result = 'failed';
        } else {
          // Unknown code — put in manual review
          result = 'manual_review';
        }
      } catch (smileErr) {
        logger.error('[BiometricController] Smile Identity API error:', smileErr.message);
        // Don't fail the whole request — fall back to manual review
        result = 'manual_review';
        rawResponse = { error: smileErr.message };
      }
    } else {
      // ── Dev/sandbox fallback (no credentials configured) ───────────────────
      logger.warn('[BiometricController] Smile Identity not configured — using dev fallback (approved)');
      result     = 'verified';
      resultCode = 'DEV_BYPASS';
    }

    // Persist verification record
    await db.query(
      `INSERT INTO driver_biometric_verifications
         (driver_id, verified_at, photo_size_kb, result,
          smile_job_id, smile_result_code, smile_confidence,
          id_number, id_type, id_country, raw_response, updated_at)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, 'CM', $9, NOW())
       ON CONFLICT (driver_id) DO UPDATE SET
         verified_at        = NOW(),
         photo_size_kb      = EXCLUDED.photo_size_kb,
         result             = EXCLUDED.result,
         smile_job_id       = EXCLUDED.smile_job_id,
         smile_result_code  = EXCLUDED.smile_result_code,
         smile_confidence   = EXCLUDED.smile_confidence,
         id_number          = EXCLUDED.id_number,
         id_type            = EXCLUDED.id_type,
         raw_response       = EXCLUDED.raw_response,
         updated_at         = NOW()`,
      [
        resolvedDriverId,
        Math.round(sizeKb),
        result,
        jobId,
        resultCode,
        confidence,
        id_number || null,
        id_type,
        rawResponse ? JSON.stringify(rawResponse) : null,
      ]
    ).catch((dbErr) => {
      logger.warn('[BiometricController] DB write failed:', dbErr.message);
    });

    if (result === 'verified') {
      return res.json({ verified: true, result, message: 'Identity verified successfully' });
    }
    if (result === 'manual_review') {
      return res.json({
        verified: false,
        result,
        message: 'Your verification is under manual review. You will be notified within 24 hours.',
      });
    }
    return res.status(422).json({
      verified: false,
      result,
      message: 'Identity verification failed. Please ensure the photo is clear and matches your ID.',
    });
  } catch (err) {
    logger.error('[BiometricController] verifyDriver:', err);
    res.status(500).json({ error: 'Verification failed', verified: false });
  }
};

/**
 * POST /users/me/verify-identity
 * Rider identity verification against trusted data sources (Smile Identity).
 * On success: sets users.is_rider_verified = true, unlocks multiple stops.
 * Riders are shown a "Verified Rider" badge to their driver for extra peace of mind.
 *
 * Body: { photo_base64, id_number?, id_type? }
 */
exports.verifyRider = async (req, res) => {
  try {
    const userId = req.user.id;
    const { photo_base64, id_number, id_type = 'NATIONAL_ID' } = req.body;

    if (!photo_base64) {
      return res.status(400).json({ error: 'No photo provided', verified: false });
    }

    const photoSizeKb = Math.round(Buffer.byteLength(photo_base64, 'utf8') * 0.75 / 1024);
    if (photoSizeKb < 5) {
      return res.status(400).json({ error: 'Photo too small. Please use a clearer image.', verified: false });
    }

    // Check if already verified
    const existing = await db.query(
      'SELECT is_rider_verified, rider_verified_at FROM users WHERE id = $1',
      [userId]
    );
    if (existing.rows[0]?.is_rider_verified) {
      return res.json({ verified: true, message: 'Identity already verified.', verified_at: existing.rows[0].rider_verified_at });
    }

    const PARTNER_ID  = process.env.SMILE_PARTNER_ID;
    const API_KEY     = process.env.SMILE_API_KEY;
    const SID_SERVER  = process.env.SMILE_SID_SERVER || '0';
    const smileUrl    = SMILE_ENDPOINT[SID_SERVER] || SMILE_ENDPOINT['0'];

    let result = 'verified'; // Default to verified in dev mode
    let resultCode = 'DEV_BYPASS';
    let confidence = null;

    if (PARTNER_ID && API_KEY) {
      const { timestamp, signature } = buildSmileSignature(PARTNER_ID, API_KEY);
      const payload = {
        partner_id:      PARTNER_ID,
        timestamp,
        sec_key:         signature,
        smile_client_id: `MOBO-RIDER-${userId}`,
        job_type:        4, // Enhanced Document Verification
        image_info_list: [{ image_type_id: 0, image: photo_base64 }],
        ...(id_number && { id_info: { country: 'CM', id_type, id_number, entered: true } }),
      };

      const smileResponse = await axios.post(`${smileUrl}/upload`, payload, { timeout: 30000 });
      const data = smileResponse.data;

      resultCode = data.result?.ResultCode || data.ResultCode || null;
      confidence = data.result?.ConfidenceValue || null;

      const PASS_CODES = ['0810', '0811'];
      result = PASS_CODES.includes(String(resultCode)) ? 'verified' : 'failed';
    }

    if (result === 'verified') {
      // Mark rider as verified — unlocks multiple stops and shows Verified badge to driver
      await db.query(
        `UPDATE users SET is_rider_verified = true, rider_verified_at = NOW() WHERE id = $1`,
        [userId]
      );
      return res.json({
        verified:    true,
        message:     'Identity verified. You can now add up to 2 stops and display your Verified Rider badge.',
        confidence,
        result_code: resultCode,
      });
    }

    return res.status(422).json({
      verified:    false,
      message:     'Identity verification failed. Please ensure your photo and ID are clear.',
      result_code: resultCode,
    });
  } catch (err) {
    logger.error('[BiometricController] verifyRider:', err);
    res.status(500).json({ error: 'Verification failed', verified: false });
  }
};

/**
 * GET /users/me/verification-status
 * Returns the current rider identity verification status.
 */
exports.getRiderVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await db.query(
      'SELECT is_rider_verified, rider_verified_at FROM users WHERE id = $1',
      [userId]
    );
    const user = rows[0];
    res.json({
      verified:    user?.is_rider_verified || false,
      verified_at: user?.rider_verified_at || null,
      benefits:    user?.is_rider_verified
        ? ['up_to_2_extra_stops', 'verified_rider_badge']
        : [],
    });
  } catch (err) {
    logger.error('[BiometricController] getRiderVerificationStatus:', err);
    res.status(500).json({ error: 'Failed to get verification status' });
  }
};

/**
 * GET /drivers/me/biometric-status
 * Returns the current biometric verification status for the logged-in driver.
 */
exports.getVerificationStatus = async (req, res) => {
  try {
    const driverId = req.user.driver_id || req.user.id;

    const driverRow = await db.query(
      'SELECT id FROM drivers WHERE user_id = $1',
      [driverId]
    ).catch(() => ({ rows: [] }));
    const resolvedDriverId = driverRow.rows[0]?.id || driverId;

    const { rows } = await db.query(
      `SELECT result, verified_at, smile_result_code, smile_confidence, id_type
       FROM driver_biometric_verifications
       WHERE driver_id = $1`,
      [resolvedDriverId]
    );

    if (rows.length === 0) {
      return res.json({ status: 'not_started', verified: false });
    }

    const rec = rows[0];
    res.json({
      status:     rec.result,
      verified:   rec.result === 'verified',
      verified_at: rec.verified_at,
      confidence: rec.smile_confidence,
      id_type:    rec.id_type,
    });
  } catch (err) {
    logger.error('[BiometricController] getVerificationStatus:', err);
    res.status(500).json({ error: 'Failed to get verification status' });
  }
};
