const logger = require('../utils/logger');
/**
 * USSD Controller — handles incoming USSD requests from telecom gateway.
 * Implements a simple stateful session menu for booking rides.
 *
 * Request format (Africa's Talking / Infobip USSD gateway):
 *   POST /rides/ussd
 *   Body: { sessionId, phoneNumber, networkCode, text }
 *
 * Response: plain text starting with "CON " (continue session) or "END " (end session)
 */
const db = require('../db');

const MENU_ROOT = `CON Welcome to MOBO
1. Book a Ride
2. My Rides
3. Cancel Last Ride
0. Exit`;

exports.handleUSSD = async (req, res) => {
  res.set('Content-Type', 'text/plain');

  const { sessionId, phoneNumber, text = '' } = req.body;
  const steps = text.split('*').filter(Boolean);
  const currentStep = steps.length;

  try {
    // Step 0 — root menu
    if (currentStep === 0) {
      await upsertSession(sessionId, phoneNumber, 'menu');
      return res.send(MENU_ROOT);
    }

    const choice = steps[0];

    // Exit
    if (choice === '0') {
      return res.send('END Thank you for using MOBO. Dial *126# anytime.');
    }

    // ── Option 1: Book a Ride
    if (choice === '1') {
      if (currentStep === 1) {
        await upsertSession(sessionId, phoneNumber, 'pickup');
        return res.send('CON Enter your pickup area name:\n(e.g. Mokolo, Bastos, Hippodrome)');
      }
      if (currentStep === 2) {
        await db.query('UPDATE ussd_sessions SET pickup_area = $1, step = $2, updated_at = NOW() WHERE session_id = $3', [steps[1], 'dropoff', sessionId]);
        return res.send('CON Enter your destination area:\n(e.g. Centre-Ville, Mvan, Nsimalen)');
      }
      if (currentStep === 3) {
        await db.query('UPDATE ussd_sessions SET dropoff_area = $1, step = $2, updated_at = NOW() WHERE session_id = $3', [steps[2], 'confirm', sessionId]);
        const session = await getSession(sessionId);
        return res.send(
          `CON Confirm your ride:\nFrom: ${session.pickup_area}\nTo: ${session.dropoff_area}\n\n1. Confirm\n2. Cancel`
        );
      }
      if (currentStep === 4) {
        if (steps[3] === '1') {
          const session = await getSession(sessionId);
          // Create a pending ride for USSD
          const { rows } = await db.query(
            `INSERT INTO rides (user_phone, pickup_address, dropoff_address, ride_type, status, booked_via_ussd)
             VALUES ($1, $2, $3, 'standard', 'pending', TRUE)
             RETURNING id`,
            [phoneNumber, session.pickup_area, session.dropoff_area]
          );
          const rideId = rows[0]?.id;
          await db.query('UPDATE ussd_sessions SET ride_id = $1, step = $2, updated_at = NOW() WHERE session_id = $3', [rideId, 'booked', sessionId]);
          return res.send(`END Ride booked! A driver is being dispatched. You will receive an SMS with driver details.\nRef: ${rideId?.slice(0, 8).toUpperCase()}`);
        } else {
          return res.send('END Ride cancelled. Dial *126# to try again.');
        }
      }
    }

    // ── Option 2: My Rides
    if (choice === '2') {
      const { rows } = await db.query(
        `SELECT id, pickup_address, dropoff_address, status, created_at
         FROM rides WHERE user_phone = $1 ORDER BY created_at DESC LIMIT 3`,
        [phoneNumber]
      );
      if (!rows.length) return res.send('END You have no recent rides. Dial *126# to book.');
      const list = rows.map((r, i) => `${i + 1}. ${r.status.toUpperCase()} — ${r.pickup_address} → ${r.dropoff_address}`).join('\n');
      return res.send(`END Recent rides:\n${list}`);
    }

    // ── Option 3: Cancel Last Ride
    if (choice === '3') {
      const { rows } = await db.query(
        `SELECT id FROM rides WHERE user_phone = $1 AND status IN ('pending','searching') ORDER BY created_at DESC LIMIT 1`,
        [phoneNumber]
      );
      if (!rows.length) return res.send('END No active ride to cancel.');
      await db.query("UPDATE rides SET status = 'cancelled' WHERE id = $1", [rows[0].id]);
      return res.send('END Your ride has been cancelled. Dial *126# to book a new ride.');
    }

    return res.send(MENU_ROOT);
  } catch (err) {
    logger.error('ussdController.handleUSSD:', err);
    return res.send('END An error occurred. Please try again or call 6200-0000 for help.');
  }
};

async function upsertSession(sessionId, phone, step) {
  await db.query(
    `INSERT INTO ussd_sessions (session_id, phone, step)
     VALUES ($1, $2, $3)
     ON CONFLICT (session_id) DO UPDATE SET step = $3, updated_at = NOW()`,
    [sessionId, phone, step]
  );
}

async function getSession(sessionId) {
  const { rows } = await db.query('SELECT * FROM ussd_sessions WHERE session_id = $1', [sessionId]);
  return rows[0] || {};
}
