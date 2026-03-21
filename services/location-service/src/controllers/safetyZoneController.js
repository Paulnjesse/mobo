/**
 * safetyZoneController.js
 * Safety incident zone management for the MOBO platform.
 * Uses the extended surge_zones table (zone_type = 'safety_incident').
 *
 * Routes (registered in location.js):
 *   GET    /safety-zones              — getSafetyZones        (authenticated)
 *   POST   /safety-zones              — createSafetyZone      (admin)
 *   POST   /safety-zones/check        — checkDriverInSafetyZone (authenticated)
 *   PATCH  /safety-zones/:id          — updateSafetyZone      (admin)
 *   DELETE /safety-zones/:id          — deleteSafetyZone      (admin, soft-delete)
 */

const db = require('../config/database');

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /safety-zones  (admin only)
 * Body: { name, city, zone_geojson (GeoJSON Polygon), incident_type,
 *         severity, alert_message, starts_at, ends_at }
 */
const createSafetyZone = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const {
      name, city, zone_geojson,
      incident_type, severity = 'medium',
      alert_message, starts_at, ends_at
    } = req.body;

    if (!name || !zone_geojson) {
      return res.status(400).json({ success: false, message: 'name and zone_geojson are required' });
    }

    const validIncidentTypes = ['crime', 'flooding', 'road_closure', 'construction', 'protest', 'other'];
    if (incident_type && !validIncidentTypes.includes(incident_type)) {
      return res.status(400).json({
        success: false,
        message: `incident_type must be one of: ${validIncidentTypes.join(', ')}`
      });
    }

    const validSeverities = ['low', 'medium', 'high'];
    if (!validSeverities.includes(severity)) {
      return res.status(400).json({
        success: false,
        message: `severity must be one of: ${validSeverities.join(', ')}`
      });
    }

    // Convert GeoJSON Polygon to PostGIS geometry
    const result = await db.query(
      `INSERT INTO surge_zones (
         name, city, zone,
         multiplier,
         zone_type, incident_type, severity, alert_message,
         starts_at, ends_at,
         is_active, driver_alerted_ids
       ) VALUES (
         $1, $2,
         ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
         1.0,
         'safety_incident', $4, $5, $6,
         $7, $8,
         true, '[]'::jsonb
       ) RETURNING *`,
      [
        name,
        city || null,
        JSON.stringify(zone_geojson),
        incident_type || null,
        severity,
        alert_message || null,
        starts_at || null,
        ends_at || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Safety zone created',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('[SafetyZone createSafetyZone]', err);
    return res.status(500).json({ success: false, message: 'Failed to create safety zone' });
  }
};

/**
 * GET /safety-zones  (authenticated)
 * Returns all active safety_incident zones.
 */
const getSafetyZones = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         id, name, city,
         zone_type, incident_type, severity, alert_message,
         starts_at, ends_at, is_active,
         driver_alerted_ids,
         created_at
       FROM surge_zones
       WHERE zone_type = 'safety_incident'
         AND is_active = true
         AND (ends_at IS NULL OR ends_at > NOW())
       ORDER BY severity DESC, created_at DESC`
    );

    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    console.error('[SafetyZone getSafetyZones]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve safety zones' });
  }
};

/**
 * POST /safety-zones/check  (authenticated)
 * Body: { latitude, longitude }
 * Checks if the authenticated driver is inside any active safety incident zone.
 * If found and driver has not been alerted yet, adds them to driver_alerted_ids
 * and inserts a push notification.
 */
const checkDriverInSafetyZone = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const driverId = req.user.id;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'latitude and longitude are required' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates' });
    }

    // Find active safety zones containing this point
    const zonesResult = await db.query(
      `SELECT
         id, name, incident_type, severity, alert_message,
         driver_alerted_ids
       FROM surge_zones
       WHERE zone_type = 'safety_incident'
         AND is_active = true
         AND (ends_at IS NULL OR ends_at > NOW())
         AND ST_Within(
           ST_SetSRID(ST_MakePoint($1, $2), 4326),
           zone
         )`,
      [lng, lat]
    );

    if (zonesResult.rows.length === 0) {
      return res.json({
        success: true,
        in_danger_zone: false,
        zones: []
      });
    }

    // For each zone, alert driver if not already alerted
    const updatedZones = [];
    for (const zone of zonesResult.rows) {
      const alertedIds = Array.isArray(zone.driver_alerted_ids)
        ? zone.driver_alerted_ids
        : JSON.parse(zone.driver_alerted_ids || '[]');

      if (!alertedIds.includes(driverId)) {
        // Add driver to alerted list
        alertedIds.push(driverId);
        await db.query(
          'UPDATE surge_zones SET driver_alerted_ids = $1 WHERE id = $2',
          [JSON.stringify(alertedIds), zone.id]
        );

        // Insert push notification for the driver
        const severityEmoji = zone.severity === 'high' ? '🔴' : zone.severity === 'medium' ? '🟠' : '🟡';
        const notifTitle = `${severityEmoji} Safety Alert: ${zone.name}`;
        const notifBody  = zone.alert_message || `${zone.incident_type || 'Incident'} reported in your area. Please proceed with caution.`;

        await db.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1, 'safety_zone_alert', $2, $3, $4::jsonb)`,
          [
            driverId,
            notifTitle,
            notifBody,
            JSON.stringify({
              zone_id:       zone.id,
              zone_name:     zone.name,
              incident_type: zone.incident_type,
              severity:      zone.severity
            })
          ]
        );
      }

      updatedZones.push({
        id:            zone.id,
        name:          zone.name,
        incident_type: zone.incident_type,
        severity:      zone.severity,
        alert_message: zone.alert_message
      });
    }

    return res.json({
      success: true,
      in_danger_zone: true,
      zones: updatedZones
    });
  } catch (err) {
    console.error('[SafetyZone checkDriverInSafetyZone]', err);
    return res.status(500).json({ success: false, message: 'Failed to check safety zone' });
  }
};

/**
 * PATCH /safety-zones/:id  (admin only)
 * Body: { name, severity, alert_message, is_active, ends_at }
 */
const updateSafetyZone = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { id } = req.params;
    const { name, severity, alert_message, is_active, ends_at } = req.body;

    // Only update provided fields
    const updates = [];
    const params  = [];
    let paramIdx  = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      params.push(name);
    }
    if (severity !== undefined) {
      const validSeverities = ['low', 'medium', 'high'];
      if (!validSeverities.includes(severity)) {
        return res.status(400).json({
          success: false,
          message: `severity must be one of: ${validSeverities.join(', ')}`
        });
      }
      updates.push(`severity = $${paramIdx++}`);
      params.push(severity);
    }
    if (alert_message !== undefined) {
      updates.push(`alert_message = $${paramIdx++}`);
      params.push(alert_message);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIdx++}`);
      params.push(is_active);
    }
    if (ends_at !== undefined) {
      updates.push(`ends_at = $${paramIdx++}`);
      params.push(ends_at);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided to update' });
    }

    params.push(id);
    const result = await db.query(
      `UPDATE surge_zones
       SET ${updates.join(', ')}
       WHERE id = $${paramIdx} AND zone_type = 'safety_incident'
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Safety zone not found' });
    }

    return res.json({
      success: true,
      message: 'Safety zone updated',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('[SafetyZone updateSafetyZone]', err);
    return res.status(500).json({ success: false, message: 'Failed to update safety zone' });
  }
};

/**
 * DELETE /safety-zones/:id  (admin only)
 * Soft delete: sets is_active = false
 */
const deleteSafetyZone = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { id } = req.params;

    const result = await db.query(
      `UPDATE surge_zones
       SET is_active = false
       WHERE id = $1 AND zone_type = 'safety_incident'
       RETURNING id, name, is_active`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Safety zone not found' });
    }

    return res.json({
      success: true,
      message: 'Safety zone deactivated',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('[SafetyZone deleteSafetyZone]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete safety zone' });
  }
};

// ── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  createSafetyZone,
  getSafetyZones,
  checkDriverInSafetyZone,
  updateSafetyZone,
  deleteSafetyZone
};
