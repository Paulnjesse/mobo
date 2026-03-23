/**
 * GDPR Data Export Controller
 * Implements GDPR Article 20 — Right to Data Portability
 *
 * GET /users/data-export
 * Returns a complete JSON export of all personal data held for the authenticated user.
 * Download is rate-limited to 1 request per 24 hours per user (prevent abuse).
 */
'use strict';

const db           = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const AppError     = require('../utils/AppError');

const EXPORT_COOLDOWN_HOURS = 24;

const getDataExport = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  // ── Rate limit: one export per 24 hours ──────────────────────────────────────
  const recentExport = await db.query(
    `SELECT created_at FROM gdpr_export_requests
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '${EXPORT_COOLDOWN_HOURS} hours'
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  ).catch(() => ({ rows: [] })); // table may not exist yet — degrade gracefully

  if (recentExport.rows.length > 0) {
    const nextAllowed = new Date(recentExport.rows[0].created_at);
    nextAllowed.setHours(nextAllowed.getHours() + EXPORT_COOLDOWN_HOURS);
    return next(new AppError(
      `Data export is available once every ${EXPORT_COOLDOWN_HOURS} hours. ` +
      `Next allowed: ${nextAllowed.toISOString()}`,
      429
    ));
  }

  // ── Gather all personal data ──────────────────────────────────────────────────

  const [
    profileResult,
    ridesResult,
    paymentsResult,
    notificationsResult,
    trustedContactsResult,
    savedPlacesResult,
    loyaltyResult,
  ] = await Promise.all([
    // Core profile (exclude password_hash, totp_secret, totp_backup_codes)
    db.query(
      `SELECT id, full_name, phone, email, role, profile_picture,
              date_of_birth, gender, country, city, language,
              is_verified, is_active, rating, total_rides,
              loyalty_points, wallet_balance, subscription_plan,
              subscription_expiry, is_teen_account, created_at, updated_at
         FROM users WHERE id = $1`,
      [userId]
    ),

    // Ride history
    db.query(
      `SELECT id, ride_type, status,
              pickup_address, dropoff_address,
              fare_xaf, distance_km, duration_minutes,
              created_at, completed_at
         FROM rides
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1000`,
      [userId]
    ),

    // Payment history (no raw card data — Stripe tokenised)
    db.query(
      `SELECT id, ride_id, amount, currency, method, status,
              provider_ref, created_at
         FROM payments
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1000`,
      [userId]
    ),

    // Notifications
    db.query(
      `SELECT id, title, body, type, is_read, created_at
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 500`,
      [userId]
    ),

    // Trusted contacts
    db.query(
      `SELECT id, name, phone, relationship, created_at
         FROM trusted_contacts
        WHERE user_id = $1`,
      [userId]
    ).catch(() => ({ rows: [] })),

    // Saved places
    db.query(
      `SELECT id, label, address, lat, lng, created_at
         FROM saved_places
        WHERE user_id = $1`,
      [userId]
    ).catch(() => ({ rows: [] })),

    // Loyalty transactions
    db.query(
      `SELECT id, points_delta, reason, created_at
         FROM loyalty_transactions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 500`,
      [userId]
    ).catch(() => ({ rows: [] })),
  ]);

  if (profileResult.rows.length === 0) {
    return next(new AppError('User not found', 404));
  }

  // ── Log the export request ────────────────────────────────────────────────────
  await db.query(
    `INSERT INTO gdpr_export_requests (user_id, ip_address, requested_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT DO NOTHING`,
    [userId, req.ip || null]
  ).catch(() => {}); // non-fatal

  // ── Build export payload ──────────────────────────────────────────────────────
  const exportData = {
    export_generated_at: new Date().toISOString(),
    export_format:       'application/json',
    gdpr_basis:          'GDPR Article 20 — Right to Data Portability',
    data: {
      profile:          profileResult.rows[0],
      rides:            ridesResult.rows,
      payments:         paymentsResult.rows,
      notifications:    notificationsResult.rows,
      trusted_contacts: trustedContactsResult.rows,
      saved_places:     savedPlacesResult.rows,
      loyalty:          loyaltyResult.rows,
    },
    counts: {
      rides:            ridesResult.rows.length,
      payments:         paymentsResult.rows.length,
      notifications:    notificationsResult.rows.length,
      trusted_contacts: trustedContactsResult.rows.length,
      saved_places:     savedPlacesResult.rows.length,
      loyalty_events:   loyaltyResult.rows.length,
    },
    notes: [
      'Location history is retained for 90 days and not included in exports older than that window.',
      'Ride history is retained for 7 years for tax compliance (GDPR Art. 17(3)(b)).',
      'Payment records show transaction references only — no raw card data is stored.',
    ],
  };

  // Return as downloadable JSON file
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="mobo-data-export-${userId}-${Date.now()}.json"`
  );

  return res.status(200).json({ success: true, data: exportData });
});

module.exports = { getDataExport };
