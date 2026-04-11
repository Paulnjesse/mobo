'use strict';
// Vehicle Inspection Controller — FREE NOW / Uber / Lyft style
// Workflow:
//   1. Driver opens inspection form before shift or when triggered by admin
//   2. Fills checklist + uploads 6 photos
//   3. Admin reviews → approved / rejected with notes
//   4. Approved inspections valid for 30 days (routine) or 1 year (annual)
//   5. Drivers with expired/rejected inspections cannot go online

const pool  = require('../config/database');
const logger = require('../utils/logger') || console;

// ── POST /inspections — Driver submits an inspection ─────────────────────────
const submitInspection = async (req, res) => {
  try {
    const driverUserId = req.headers['x-user-id'];
    const {
      inspection_type = 'routine',
      exterior_ok, interior_ok, tires_ok, brakes_ok,
      lights_ok, windshield_ok, seatbelts_ok, airbags_ok,
      first_aid_ok, fire_ext_ok,
      photo_front, photo_rear, photo_driver_side,
      photo_passenger_side, photo_interior, photo_dashboard,
      odometer_km, driver_notes,
    } = req.body;

    const driverRow = await pool.query(
      'SELECT id, vehicle_id FROM drivers WHERE user_id = $1 AND is_approved = true',
      [driverUserId]
    );
    if (!driverRow.rows[0]) return res.status(403).json({ error: 'Approved driver account required' });
    const { id: driverId, vehicle_id: vehicleId } = driverRow.rows[0];

    if (!vehicleId) return res.status(400).json({ error: 'No vehicle linked to your account' });

    // Require at least front + interior photos
    if (!photo_front || !photo_interior) {
      return res.status(400).json({ error: 'photo_front and photo_interior are required' });
    }

    // Minimum checklist: all safety items must be answered
    const requiredFields = { exterior_ok, interior_ok, tires_ok, brakes_ok, lights_ok, seatbelts_ok };
    for (const [key, val] of Object.entries(requiredFields)) {
      if (typeof val !== 'boolean') {
        return res.status(400).json({ error: `${key} is required (true/false)` });
      }
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (inspection_type === 'annual' ? 365 : 30));

    const result = await pool.query(
      `INSERT INTO vehicle_inspections
         (vehicle_id, driver_id, inspection_type, status,
          exterior_ok, interior_ok, tires_ok, brakes_ok, lights_ok,
          windshield_ok, seatbelts_ok, airbags_ok, first_aid_ok, fire_ext_ok,
          photo_front, photo_rear, photo_driver_side, photo_passenger_side,
          photo_interior, photo_dashboard,
          odometer_km, driver_notes, due_date)
       VALUES ($1,$2,$3,'submitted',
               $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
               $14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        vehicleId, driverId, inspection_type,
        exterior_ok, interior_ok, tires_ok, brakes_ok, lights_ok,
        windshield_ok ?? null, seatbelts_ok, airbags_ok ?? null,
        first_aid_ok ?? null, fire_ext_ok ?? null,
        photo_front, photo_rear ?? null, photo_driver_side ?? null,
        photo_passenger_side ?? null, photo_interior, photo_dashboard ?? null,
        odometer_km ?? null, driver_notes ?? null, dueDate.toISOString().split('T')[0],
      ]
    );

    res.status(201).json({ inspection: result.rows[0], message: 'Inspection submitted for review' });
  } catch (err) {
    logger.error({ err }, '[VehicleInspection] submitInspection error');
    res.status(500).json({ error: err.message });
  }
};

// ── GET /inspections/me — Driver views their inspection history ───────────────
const getMyInspections = async (req, res) => {
  try {
    const driverUserId = req.headers['x-user-id'];
    const driverRow = await pool.query('SELECT id FROM drivers WHERE user_id = $1', [driverUserId]);
    if (!driverRow.rows[0]) return res.status(403).json({ error: 'Not a driver' });

    const result = await pool.query(
      `SELECT vi.*, v.make, v.model, v.plate_number
       FROM vehicle_inspections vi
       JOIN vehicles v ON v.id = vi.vehicle_id
       WHERE vi.driver_id = $1
       ORDER BY vi.created_at DESC LIMIT 20`,
      [driverRow.rows[0].id]
    );
    res.json({ inspections: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /inspections/me/current — Latest inspection + status ─────────────────
const getMyCurrentInspection = async (req, res) => {
  try {
    const driverUserId = req.headers['x-user-id'];
    const driverRow = await pool.query('SELECT id, vehicle_id FROM drivers WHERE user_id = $1', [driverUserId]);
    if (!driverRow.rows[0]) return res.status(403).json({ error: 'Not a driver' });

    const result = await pool.query(
      `SELECT vi.*, v.make, v.model, v.plate_number, v.inspection_status
       FROM vehicle_inspections vi
       JOIN vehicles v ON v.id = vi.vehicle_id
       WHERE vi.driver_id = $1
       ORDER BY vi.created_at DESC LIMIT 1`,
      [driverRow.rows[0].id]
    );

    const inspection = result.rows[0] || null;
    const isValid = inspection?.status === 'approved'
      && new Date(inspection.due_date) >= new Date();

    res.json({ inspection, is_valid: isValid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /admin/inspections — Admin lists all pending inspections ──────────────
const listInspections = async (req, res) => {
  try {
    const { status = 'submitted', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT vi.*,
              v.make, v.model, v.plate_number, v.vehicle_category,
              u.full_name AS driver_name, u.phone AS driver_phone
       FROM vehicle_inspections vi
       JOIN vehicles v ON v.id = vi.vehicle_id
       JOIN drivers d  ON d.id = vi.driver_id
       JOIN users u    ON u.id = d.user_id
       WHERE ($1 = 'all' OR vi.status = $1)
       ORDER BY vi.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    const count = await pool.query(
      'SELECT COUNT(*) FROM vehicle_inspections WHERE ($1 = $1)',
      [status]
    );

    res.json({ inspections: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /admin/inspections/:id — Admin views single inspection ────────────────
const getInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT vi.*,
              v.make, v.model, v.plate_number, v.year, v.color, v.vehicle_category,
              u.full_name AS driver_name, u.phone AS driver_phone, u.email AS driver_email
       FROM vehicle_inspections vi
       JOIN vehicles v ON v.id = vi.vehicle_id
       JOIN drivers d  ON d.id = vi.driver_id
       JOIN users u    ON u.id = d.user_id
       WHERE vi.id = $1`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Inspection not found' });
    res.json({ inspection: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── PATCH /admin/inspections/:id/review — Admin approves or rejects ───────────
const reviewInspection = async (req, res) => {
  try {
    const adminId   = req.headers['x-user-id'];
    const { id }    = req.params;
    const { decision, admin_notes, rejection_reason } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approved or rejected' });
    }
    if (decision === 'rejected' && !rejection_reason) {
      return res.status(400).json({ error: 'rejection_reason is required when rejecting' });
    }

    const insp = await pool.query(
      'SELECT * FROM vehicle_inspections WHERE id = $1',
      [id]
    );
    if (!insp.rows[0]) return res.status(404).json({ error: 'Inspection not found' });
    if (insp.rows[0].status !== 'submitted') {
      return res.status(409).json({ error: 'Inspection is not in submitted state' });
    }

    const updated = await pool.query(
      `UPDATE vehicle_inspections
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(),
           admin_notes = $3, rejection_reason = $4,
           completed_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [decision, adminId, admin_notes ?? null, rejection_reason ?? null, id]
    );

    // Update vehicle.inspection_status for quick lookup
    await pool.query(
      `UPDATE vehicles SET inspection_status = $1,
         last_inspection_id = $2, last_inspection_at = NOW()
       WHERE id = $3`,
      [decision, id, insp.rows[0].vehicle_id]
    );

    // Notify driver
    const pushResult = await pool.query(
      `SELECT u.expo_push_token FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.id = $1`,
      [insp.rows[0].driver_id]
    );
    const token = pushResult.rows[0]?.expo_push_token;
    if (token) {
      const title = decision === 'approved' ? '✅ Inspection Approved' : '❌ Inspection Rejected';
      const body  = decision === 'approved'
        ? 'Your vehicle inspection has been approved. You can now go online.'
        : `Your vehicle inspection was rejected: ${rejection_reason}`;
      // Non-blocking push
      require('../utils/push').sendPush(token, title, body, { type: 'inspection_review', decision }).catch(() => {});
    }

    res.json({ inspection: updated.rows[0], message: `Inspection ${decision}` });
  } catch (err) {
    logger.error({ err }, '[VehicleInspection] reviewInspection error');
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  submitInspection,
  getMyInspections,
  getMyCurrentInspection,
  listInspections,
  getInspection,
  reviewInspection,
};
