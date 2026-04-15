const logger = require('../utils/logger');
const db = require('../config/database');

/**
 * GET /users/me/trusted-contacts
 * Returns all trusted contacts for the authenticated user.
 */
const getTrustedContacts = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT id, name, phone, email, notify_on_trip_start, notify_on_sos, created_at
       FROM trusted_contacts
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[TrustedContacts] getTrustedContacts error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /users/me/trusted-contacts
 * Add a trusted contact. Max 5 per user.
 * Body: { name, phone, email?, notify_on_trip_start?, notify_on_sos? }
 */
const addTrustedContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      phone,
      email = null,
      notify_on_trip_start = true,
      notify_on_sos = true
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'name and phone are required' });
    }

    // Enforce max 5 contacts
    const countResult = await db.query(
      'SELECT COUNT(*) FROM trusted_contacts WHERE user_id = $1',
      [userId]
    );
    if (parseInt(countResult.rows[0].count, 10) >= 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum of 5 trusted contacts allowed'
      });
    }

    const result = await db.query(
      `INSERT INTO trusted_contacts (user_id, name, phone, email, notify_on_trip_start, notify_on_sos)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, phone, email, notify_on_trip_start, notify_on_sos, created_at`,
      [userId, name, phone, email, notify_on_trip_start, notify_on_sos]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      // unique violation — (user_id, phone) pair already exists
      return res.status(400).json({ success: false, message: 'This phone number is already a trusted contact' });
    }
    logger.error('[TrustedContacts] addTrustedContact error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /users/me/trusted-contacts/:id
 * Update a trusted contact by id. Verifies ownership.
 * Body: any subset of { name, phone, email, notify_on_trip_start, notify_on_sos }
 */
const updateTrustedContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify ownership
    const existing = await db.query(
      'SELECT id FROM trusted_contacts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Trusted contact not found' });
    }

    const { name, phone, email, notify_on_trip_start, notify_on_sos } = req.body;

    // Build dynamic SET clause
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined)                { fields.push(`name = $${idx++}`);                values.push(name); }
    if (phone !== undefined)               { fields.push(`phone = $${idx++}`);               values.push(phone); }
    if (email !== undefined)               { fields.push(`email = $${idx++}`);               values.push(email); }
    if (notify_on_trip_start !== undefined){ fields.push(`notify_on_trip_start = $${idx++}`);values.push(notify_on_trip_start); }
    if (notify_on_sos !== undefined)       { fields.push(`notify_on_sos = $${idx++}`);       values.push(notify_on_sos); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(id, userId);
    const result = await db.query(
      `UPDATE trusted_contacts
       SET ${fields.join(', ')}
       WHERE id = $${idx} AND user_id = $${idx + 1}
       RETURNING id, name, phone, email, notify_on_trip_start, notify_on_sos, created_at`,
      values
    );

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'This phone number is already a trusted contact' });
    }
    logger.error('[TrustedContacts] updateTrustedContact error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /users/me/trusted-contacts/:id
 * Remove a trusted contact by id. Verifies ownership.
 */
const removeTrustedContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM trusted_contacts WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Trusted contact not found' });
    }

    return res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (err) {
    logger.error('[TrustedContacts] removeTrustedContact error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getTrustedContacts,
  addTrustedContact,
  updateTrustedContact,
  removeTrustedContact
};
