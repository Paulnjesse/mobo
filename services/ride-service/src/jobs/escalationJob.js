/**
 * escalationJob.js
 *
 * Polls every 30 seconds for ride check-ins that have had no response
 * for 60+ seconds. Uses a single atomic UPDATE...FROM...RETURNING query
 * so no two job runs can escalate the same row (no race condition).
 *
 * On escalation:
 *   1. Sets escalated = true + escalated_at = NOW() atomically
 *   2. Inserts an admin notification row
 *   3. SMS-es the rider's trusted contacts (notify_on_sos = true)
 *
 * SOS checkins (checkin_type = 'sos') are excluded — they are already
 * marked escalated at insert time by sosController and handled separately.
 */

const db = require('../config/database');
const logger = require('../utils/logger');
const { withLock } = require('../utils/distributedLock');
const { recordJobRun, recordJobPending } = require('../utils/jobMetrics');

const POLL_INTERVAL_MS   = 30 * 1000;  // poll every 30 s
const ESCALATION_TIMEOUT = 60;         // seconds before auto-escalation
// Lock TTL: slightly longer than the poll interval so a slow tick doesn't
// block the next one; shorter than 2× the interval so a crashed instance
// doesn't lock out the job for two full cycles.
const LOCK_TTL_MS = 25_000;

// Lazy-load Twilio so missing credentials never crash the service
function getTwilioClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  try {
    return require('twilio')(sid, token);
  } catch {
    return null;
  }
}

async function runEscalation() {
  await withLock('lock:escalation-job', LOCK_TTL_MS, _doEscalation);
}

async function _doEscalation() {
  try {
    // ── Atomic: mark rows as escalated and return them in one statement ──────
    // UPDATE...FROM...RETURNING prevents two concurrent runs from touching
    // the same row — PostgreSQL row-level locking handles it automatically.
    const result = await db.query(`
      UPDATE ride_checkins rc
      SET    escalated    = true,
             escalated_at = NOW()
      FROM   rides r
      WHERE  rc.ride_id       = r.id
        AND  rc.response      IS NULL
        AND  rc.escalated     IS NOT TRUE
        AND  rc.checkin_type  != 'sos'
        AND  rc.created_at    < NOW() - ($1 || ' seconds')::INTERVAL
        AND  r.status         = 'in_progress'
      RETURNING
        rc.id,
        rc.ride_id,
        rc.user_id,
        rc.checkin_type,
        rc.address,
        r.rider_id,
        r.driver_id
    `, [ESCALATION_TIMEOUT]);

    recordJobPending('escalation_job', result.rows.length);
    recordJobRun('escalation_job');

    if (result.rows.length === 0) return;

    logger.info(`[EscalationJob] Auto-escalating ${result.rows.length} unanswered check-in(s)`);

    for (const checkin of result.rows) {
      try {
        // ── 1. Insert admin notification ────────────────────────────────────
        await db.query(
          `INSERT INTO notifications (user_id, type, title, body, data, is_read)
           SELECT id,
                  'sos_escalation',
                  '🚨 Auto-Escalation Alert',
                  'No response to safety check-in after ${ESCALATION_TIMEOUT}s. Ride: ' || $1,
                  $2::jsonb,
                  false
           FROM users
           WHERE role = 'admin' AND is_active = true`,
          [
            checkin.ride_id,
            JSON.stringify({
              ride_id:    checkin.ride_id,
              checkin_id: checkin.id,
              type:       checkin.checkin_type,
              timestamp:  new Date().toISOString(),
            }),
          ]
        );

        // ── 2. SMS trusted contacts of the rider ────────────────────────────
        const contactsResult = await db.query(
          `SELECT name, phone
           FROM trusted_contacts
           WHERE user_id = $1 AND notify_on_sos = true`,
          [checkin.rider_id || checkin.user_id]
        );

        if (contactsResult.rows.length > 0) {
          const client = getTwilioClient();
          const from   = process.env.TWILIO_FROM_NUMBER;
          const body   = `🚨 MOBO SAFETY ALERT: Your contact may need help. Their ride has an unresolved safety check-in near ${checkin.address || 'unknown location'}. Please contact them immediately or call 117.`;

          if (client && from) {
            for (const contact of contactsResult.rows) {
              client.messages
                .create({ body, from, to: contact.phone })
                .catch((err) =>
                  logger.warn('[EscalationJob] SMS failed', { phone: contact.phone, err: err.message })
                );
            }
          } else {
            logger.info('[EscalationJob] Twilio not configured — skipping SMS', {
              contacts: contactsResult.rows.length, checkinId: checkin.id,
            });
          }
        }

        logger.info('[EscalationJob] Escalated checkin', { checkinId: checkin.id, rideId: checkin.ride_id });
      } catch (innerErr) {
        logger.error('[EscalationJob] Post-escalation actions failed', {
          checkinId: checkin.id, err: innerErr.message,
        });
      }
    }
  } catch (err) {
    logger.error('[EscalationJob] Poll error', { err: err.message });
  }
}

function startEscalationJob() {
  logger.info('[EscalationJob] Started', { pollIntervalSec: POLL_INTERVAL_MS / 1000, escalationTimeoutSec: ESCALATION_TIMEOUT });
  // Run immediately on startup to catch anything missed during downtime
  runEscalation();
  setInterval(runEscalation, POLL_INTERVAL_MS);
}

module.exports = { startEscalationJob };
