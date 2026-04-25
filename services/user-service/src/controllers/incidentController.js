'use strict';
/**
 * incidentController.js — Incident lifecycle management (CF-003)
 *
 * Incidents track operational failures from detection to resolution.
 * Severity-based SLA deadlines are auto-set by the DB trigger in migration_043.
 *
 * Status flow:  open → investigating → resolved → closed
 */

const db     = require('../config/database');
const logger = require('../utils/logger');

const VALID_TYPES     = ['payment_failure','driver_fraud','system_outage','gps_anomaly','delay','safety','other'];
const VALID_SEVERITIES = ['low','medium','high','critical'];
const VALID_STATUSES  = ['open','investigating','resolved','closed'];

// ── Create ────────────────────────────────────────────────────────────────────

exports.createIncident = async (req, res) => {
  try {
    const adminId = req.user?.id;
    const { type, severity = 'medium', title, description, root_cause_tag,
            ride_id, payment_id, driver_id, user_id, metadata } = req.body;

    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (!VALID_SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` });
    }
    if (!title || title.trim().length < 5) {
      return res.status(400).json({ error: 'title is required (min 5 chars)' });
    }

    const { rows } = await db.query(
      `INSERT INTO incidents
         (type, severity, title, description, root_cause_tag,
          ride_id, payment_id, driver_id, user_id, created_by, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        type, severity, title.trim(), description || null, root_cause_tag || null,
        ride_id || null, payment_id || null, driver_id || null, user_id || null,
        adminId, JSON.stringify(metadata || {}),
      ]
    );

    logger.info('[Incident] Created', { id: rows[0].id, type, severity, created_by: adminId });
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error('[Incident] createIncident error', { err: err.message });
    res.status(500).json({ error: 'Failed to create incident' });
  }
};

// ── List ──────────────────────────────────────────────────────────────────────

exports.listIncidents = async (req, res) => {
  try {
    const { status, severity, type, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit) || 50);
    const pageSize = Math.min(100, parseInt(limit) || 50);

    const conditions = [];
    const params     = [];

    if (status && VALID_STATUSES.includes(status)) {
      conditions.push(`i.status = $${params.push(status)}`);
    }
    if (severity && VALID_SEVERITIES.includes(severity)) {
      conditions.push(`i.severity = $${params.push(severity)}`);
    }
    if (type && VALID_TYPES.includes(type)) {
      conditions.push(`i.type = $${params.push(type)}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*) FROM incidents i ${where}`, params
    );

    const { rows } = await db.query(
      `SELECT i.*,
              creator.full_name AS created_by_name,
              assignee.full_name AS assigned_to_name,
              CASE WHEN i.sla_deadline < NOW() AND i.status NOT IN ('resolved','closed')
                   THEN true ELSE false END AS sla_breached
       FROM   incidents i
       LEFT JOIN users creator  ON creator.id  = i.created_by
       LEFT JOIN users assignee ON assignee.id = i.assigned_to
       ${where}
       ORDER BY
         CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         i.created_at DESC
       LIMIT $${params.push(pageSize)} OFFSET $${params.push(offset)}`,
      params
    );

    res.json({
      success: true,
      data:  rows,
      meta:  { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: pageSize },
    });
  } catch (err) {
    logger.error('[Incident] listIncidents error', { err: err.message });
    res.status(500).json({ error: 'Failed to list incidents' });
  }
};

// ── Get one ───────────────────────────────────────────────────────────────────

exports.getIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT i.*,
              creator.full_name  AS created_by_name,
              assignee.full_name AS assigned_to_name,
              resolver.full_name AS resolved_by_name,
              CASE WHEN i.sla_deadline < NOW() AND i.status NOT IN ('resolved','closed')
                   THEN true ELSE false END AS sla_breached
       FROM   incidents i
       LEFT JOIN users creator  ON creator.id  = i.created_by
       LEFT JOIN users assignee ON assignee.id = i.assigned_to
       LEFT JOIN users resolver ON resolver.id = i.resolved_by
       WHERE i.id = $1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Incident not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error('[Incident] getIncident error', { err: err.message });
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
};

// ── Update status / assignment ────────────────────────────────────────────────

exports.updateIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;
    const { status, severity, assigned_to, root_cause_tag, description, metadata } = req.body;

    // Build dynamic SET clause
    const sets   = [];
    const params = [];

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      sets.push(`status = $${params.push(status)}`);
      if (status === 'resolved') {
        sets.push(`resolved_by = $${params.push(adminId)}`);
        sets.push(`resolved_at = NOW()`);
      }
    }
    if (severity) {
      if (!VALID_SEVERITIES.includes(severity)) {
        return res.status(400).json({ error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` });
      }
      sets.push(`severity = $${params.push(severity)}`);
    }
    if (assigned_to !== undefined) sets.push(`assigned_to = $${params.push(assigned_to || null)}`);
    if (root_cause_tag !== undefined) sets.push(`root_cause_tag = $${params.push(root_cause_tag)}`);
    if (description !== undefined) sets.push(`description = $${params.push(description)}`);
    if (metadata) sets.push(`metadata = metadata || $${params.push(JSON.stringify(metadata))}::jsonb`);

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(id);
    const { rows } = await db.query(
      `UPDATE incidents SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (!rows[0]) return res.status(404).json({ error: 'Incident not found' });

    logger.info('[Incident] Updated', { id, status, updated_by: adminId });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error('[Incident] updateIncident error', { err: err.message });
    res.status(500).json({ error: 'Failed to update incident' });
  }
};

// ── SLA breaches ──────────────────────────────────────────────────────────────

exports.getSlaBreaches = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT i.*, creator.full_name AS created_by_name,
              EXTRACT(EPOCH FROM (NOW() - i.sla_deadline)) / 60 AS overdue_minutes
       FROM   incidents i
       LEFT JOIN users creator ON creator.id = i.created_by
       WHERE  i.sla_deadline < NOW()
         AND  i.status NOT IN ('resolved','closed')
       ORDER  BY i.sla_deadline ASC`
    );
    res.json({ success: true, data: rows, total: rows.length });
  } catch (err) {
    logger.error('[Incident] getSlaBreaches error', { err: err.message });
    res.status(500).json({ error: 'Failed to fetch SLA breaches' });
  }
};
