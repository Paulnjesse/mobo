/**
 * escalationJob.js
 * Polls every 30 seconds for ride check-ins that have had no response for 60+ seconds.
 * If found: marks as escalated, notifies admin, attempts to notify rider's emergency contacts.
 */
const db = require('../config/database');

const POLL_INTERVAL_MS   = 30 * 1000;   // poll every 30s
const ESCALATION_TIMEOUT = 60 * 1000;   // escalate if no response in 60s

async function runEscalation() {
  try {
    // Find unanswered check-ins older than 60 seconds
    const result = await db.query(`
      SELECT rc.id, rc.ride_id, rc.user_id, rc.checkin_type, rc.address,
             r.driver_id, r.rider_id
      FROM ride_checkins rc
      JOIN rides r ON r.id = rc.ride_id
      WHERE rc.response IS NULL
        AND rc.escalated IS NOT TRUE
        AND rc.created_at < NOW() - INTERVAL '60 seconds'
        AND r.status = 'in_progress'
    `);

    for (const checkin of result.rows) {
      try {
        // 1. Mark as escalated
        await db.query(
          'UPDATE ride_checkins SET escalated = true, escalated_at = NOW() WHERE id = $1',
          [checkin.id]
        );

        // 2. Notify admin via notifications table
        await db.query(
          `INSERT INTO notifications (user_id, type, title, body, data, is_read)
           SELECT id, 'sos_escalation', '🚨 Auto-Escalation Alert',
             'No response to safety check-in for ' || $1 || ' seconds. Ride: ' || $2,
             $3::jsonb, false
           FROM users WHERE role = 'admin' AND is_active = true`,
          [
            '60',
            checkin.ride_id,
            JSON.stringify({ ride_id: checkin.ride_id, checkin_id: checkin.id, type: checkin.checkin_type })
          ]
        );

        // 3. Notify rider's trusted contacts (SOS)
        const contacts = await db.query(
          'SELECT name, phone FROM trusted_contacts WHERE user_id = $1 AND notify_on_sos = true',
          [checkin.rider_id || checkin.user_id]
        );

        if (contacts.rows.length > 0) {
          const sid   = process.env.TWILIO_ACCOUNT_SID;
          const token = process.env.TWILIO_AUTH_TOKEN;
          const from  = process.env.TWILIO_FROM_NUMBER;

          if (sid && token && from) {
            const twilio = require('twilio')(sid, token);
            for (const contact of contacts.rows) {
              try {
                await twilio.messages.create({
                  body: `🚨 MOBO SAFETY ALERT: Your contact may need help. Their ride has an unresolved safety check-in near ${checkin.address || 'unknown location'}. Please contact them immediately.`,
                  from,
                  to: contact.phone
                });
              } catch (smsErr) {
                console.warn(`[EscalationJob] SMS failed for ${contact.phone}:`, smsErr.message);
              }
            }
          } else {
            console.log(`[EscalationJob] Would SMS ${contacts.rows.length} contacts for checkin ${checkin.id}`);
          }
        }

        console.log(`[EscalationJob] Escalated checkin ${checkin.id} for ride ${checkin.ride_id}`);
      } catch (innerErr) {
        console.error(`[EscalationJob] Failed for checkin ${checkin.id}:`, innerErr.message);
      }
    }
  } catch (err) {
    console.error('[EscalationJob] Poll error:', err.message);
  }
}

function startEscalationJob() {
  console.log('[EscalationJob] Started — polling every 30s for unanswered check-ins');
  setInterval(runEscalation, POLL_INTERVAL_MS);
  // Run immediately on start
  runEscalation();
}

module.exports = { startEscalationJob };
