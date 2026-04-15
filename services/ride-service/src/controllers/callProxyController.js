const logger = require('../utils/logger');
const pool = require('../config/database');
const crypto = require('crypto');

// ── Call Proxy / Masked Phone Numbers ────────────────────────────────────────
// Architecture:
//   1. Caller hits POST /rides/:id/initiate-call
//   2. Backend creates a call_session with a unique token
//   3. Returns the masked number (Twilio Proxy / Africa's Talking) + session token
//   4. Mobile uses the masked number for the call — real numbers stay hidden
//   5. Session expires after 24h or ride completion
//
// In production: integrate Twilio Proxy SDK or Africa's Talking Voice API.
// Here we implement the full DB layer + API contract so the integration is drop-in.
// ─────────────────────────────────────────────────────────────────────────────

const PROXY_PROVIDER = process.env.CALL_PROXY_PROVIDER || 'mock'; // 'twilio' | 'africastalking' | 'mock'
const MOCK_PROXY_NUMBER = process.env.MOCK_PROXY_NUMBER || '+237 600 000 000';

async function createTwilioProxySession(callerPhone, calleePhone) {
  // Twilio Proxy SDK integration point
  // const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  // const service = client.proxy.v1.services(process.env.TWILIO_PROXY_SERVICE_SID);
  // const session = await service.sessions.create({ uniqueName: crypto.randomUUID(), ttl: 86400 });
  // await session.participants.create({ identifier: callerPhone });
  // await session.participants.create({ identifier: calleePhone });
  // return session.sid;
  throw new Error('Twilio not configured');
}

// POST /rides/:id/initiate-call
const initiateCall = async (req, res) => {
  try {
    const { id: rideId } = req.params;
    const callerId = req.headers['x-user-id'];

    // Get ride + both parties
    const ride = await pool.query(
      `SELECT r.*, u.phone as rider_phone, u.id as rider_user_id,
              du.phone as driver_phone, du.id as driver_user_id
       FROM rides r
       JOIN users u ON r.rider_id = u.id
       LEFT JOIN drivers d ON r.driver_id = d.id
       LEFT JOIN users du ON d.user_id = du.id
       WHERE r.id = $1`,
      [rideId]
    );
    if (!ride.rows[0]) return res.status(404).json({ error: 'Ride not found' });

    const r = ride.rows[0];
    const isRider  = String(callerId) === String(r.rider_user_id);
    const isDriver = String(callerId) === String(r.driver_user_id);
    if (!isRider && !isDriver) return res.status(403).json({ error: 'Not a participant in this ride' });

    const calleeId = isRider ? r.driver_user_id : r.rider_user_id;

    // Check for existing active session
    const existing = await pool.query(
      `SELECT * FROM call_sessions
       WHERE ride_id = $1 AND caller_id = $2 AND status = 'active' AND expires_at > NOW()`,
      [rideId, callerId]
    );
    if (existing.rows[0]) {
      return res.json({
        session_token: existing.rows[0].session_token,
        masked_number: existing.rows[0].masked_number || MOCK_PROXY_NUMBER,
        expires_at: existing.rows[0].expires_at,
        provider: PROXY_PROVIDER,
      });
    }

    const sessionToken = crypto.randomBytes(20).toString('hex');
    const expiresAt    = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    let maskedNumber   = MOCK_PROXY_NUMBER;

    // Attempt real proxy if configured
    if (PROXY_PROVIDER === 'twilio') {
      try {
        const callerPhone = isRider ? r.rider_phone : r.driver_phone;
        const calleePhone = isRider ? r.driver_phone : r.rider_phone;
        maskedNumber = await createTwilioProxySession(callerPhone, calleePhone);
      } catch (e) {
        logger.warn('[CallProxy] Twilio failed, using mock:', e.message);
      }
    }

    await pool.query(
      `INSERT INTO call_sessions (ride_id, caller_id, callee_id, masked_number, session_token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [rideId, callerId, calleeId, maskedNumber, sessionToken, expiresAt]
    );

    res.json({
      session_token: sessionToken,
      masked_number: maskedNumber,
      expires_at: expiresAt,
      provider: PROXY_PROVIDER,
      // Instructions for mobile: dial masked_number — your real number is protected
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /rides/:id/end-call
const endCallSession = async (req, res) => {
  try {
    const { id: rideId } = req.params;
    const { session_token, duration_seconds } = req.body;
    await pool.query(
      `UPDATE call_sessions SET status = 'ended', call_duration_s = $1
       WHERE ride_id = $2 AND session_token = $3`,
      [duration_seconds || 0, rideId, session_token]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { initiateCall, endCallSession };
