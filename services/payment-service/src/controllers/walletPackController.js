'use strict';
/**
 * walletPackController.js
 * Wallet Credit Packs — purchase wallet credits with optional bonus.
 *
 * Public (authenticated rider / driver):
 *   GET  /payments/wallet-packs            — list available packs
 *   POST /payments/wallet-packs/:id/buy    — purchase a pack (credits wallet)
 *   GET  /payments/wallet-packs/purchases  — my purchase history
 *
 * Admin only:
 *   GET    /payments/admin/wallet-packs            — list all packs (with purchase stats)
 *   POST   /payments/admin/wallet-packs            — create pack
 *   PUT    /payments/admin/wallet-packs/:id        — update pack
 *   PATCH  /payments/admin/wallet-packs/:id/toggle — activate / deactivate
 *   DELETE /payments/admin/wallet-packs/:id        — delete (only if no purchases)
 *   GET    /payments/admin/wallet-packs/purchases  — all purchases (paginated)
 */

const { v4: uuidv4 } = require('uuid');
const db     = require('../config/database');
const logger = require('../utils/logger');

// ── Public: list active packs for this user's role ───────────────────────────
exports.listPacks = async (req, res) => {
  try {
    const userRole = req.user?.role || 'rider';  // 'driver' | 'rider' | 'admin'
    // drivers see driver + both; riders see rider + both
    const typeFilter = userRole === 'driver' ? ['driver', 'both'] : ['rider', 'both'];

    const { rows } = await db.query(
      `SELECT id, name, pack_type, price_xaf, credit_xaf, bonus_percent,
              ROUND(credit_xaf * bonus_percent / 100)::INT AS bonus_xaf,
              credit_xaf + ROUND(credit_xaf * bonus_percent / 100)::INT AS total_credit_xaf,
              description, valid_days, sort_order
       FROM wallet_credit_packs
       WHERE is_active = true AND pack_type = ANY($1::text[])
       ORDER BY sort_order ASC, price_xaf ASC`,
      [typeFilter]
    );
    res.json({ packs: rows });
  } catch (err) {
    logger.error('[WalletPack] listPacks:', err);
    res.status(500).json({ error: 'Failed to load wallet packs' });
  }
};

// ── Public: purchase a pack ───────────────────────────────────────────────────
exports.purchasePack = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id: packId } = req.params;
    const userId = req.user?.id;

    // Load pack
    const packRes = await client.query(
      `SELECT * FROM wallet_credit_packs WHERE id = $1 AND is_active = true`, [packId]
    );
    if (!packRes.rows.length) {
      return res.status(404).json({ error: 'Pack not found or inactive' });
    }
    const pack = packRes.rows[0];

    // Check pack_type matches user role
    const userRole = req.user?.role || 'rider';
    if (pack.pack_type !== 'both') {
      const allowed = pack.pack_type === userRole;
      if (!allowed) {
        return res.status(403).json({ error: `This pack is for ${pack.pack_type}s only` });
      }
    }

    const bonusXAF       = Math.round(pack.credit_xaf * pack.bonus_percent / 100);
    const totalCreditXAF = pack.credit_xaf + bonusXAF;
    const paymentRef     = uuidv4();
    const expiresAt      = pack.valid_days
      ? new Date(Date.now() + pack.valid_days * 86400 * 1000)
      : null;

    await client.query('BEGIN');

    // Credit wallet
    await client.query(
      `UPDATE users SET wallet_balance = wallet_balance + $2 WHERE id = $1`,
      [userId, totalCreditXAF]
    );

    // Record purchase
    const { rows } = await client.query(
      `INSERT INTO wallet_pack_purchases
         (user_id, pack_id, amount_paid_xaf, credit_xaf, bonus_xaf,
          total_credited_xaf, expires_at, payment_method, payment_ref, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed')
       RETURNING *`,
      [userId, pack.id, pack.price_xaf, pack.credit_xaf, bonusXAF,
       totalCreditXAF, expiresAt, req.body.payment_method || 'wallet', paymentRef]
    );

    await client.query('COMMIT');

    logger.info(`[WalletPack] User ${userId} purchased pack "${pack.name}" — +${totalCreditXAF} XAF`);

    // Return updated wallet balance
    const walletRes = await db.query(`SELECT wallet_balance FROM users WHERE id = $1`, [userId]);
    res.json({
      message:          `Pack "${pack.name}" purchased successfully`,
      total_credited:   totalCreditXAF,
      bonus_xaf:        bonusXAF,
      wallet_balance:   walletRes.rows[0]?.wallet_balance || 0,
      purchase:         rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('[WalletPack] purchasePack:', err);
    res.status(500).json({ error: 'Failed to purchase pack' });
  } finally {
    client.release();
  }
};

// ── Public: my purchase history ───────────────────────────────────────────────
exports.myPurchases = async (req, res) => {
  try {
    const userId = req.user?.id;
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const { rows } = await db.query(
      `SELECT pp.id, pp.amount_paid_xaf, pp.credit_xaf, pp.bonus_xaf,
              pp.total_credited_xaf, pp.expires_at, pp.payment_method,
              pp.status, pp.created_at,
              wp.name AS pack_name, wp.pack_type
       FROM wallet_pack_purchases pp
       JOIN wallet_credit_packs wp ON wp.id = pp.pack_id
       WHERE pp.user_id = $1
       ORDER BY pp.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    res.json({ purchases: rows });
  } catch (err) {
    logger.error('[WalletPack] myPurchases:', err);
    res.status(500).json({ error: 'Failed to load purchase history' });
  }
};

// ── Admin: list all packs with purchase stats ─────────────────────────────────
exports.adminListPacks = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT wp.*,
              COUNT(pp.id)::INT                  AS total_purchases,
              COALESCE(SUM(pp.amount_paid_xaf),0)::BIGINT AS total_revenue_xaf
       FROM wallet_credit_packs wp
       LEFT JOIN wallet_pack_purchases pp ON pp.pack_id = wp.id AND pp.status = 'completed'
       GROUP BY wp.id
       ORDER BY wp.sort_order ASC, wp.created_at ASC`
    );
    res.json({ packs: rows });
  } catch (err) {
    logger.error('[WalletPack] adminListPacks:', err);
    res.status(500).json({ error: 'Failed to list packs' });
  }
};

// ── Admin: create pack ────────────────────────────────────────────────────────
exports.createPack = async (req, res) => {
  try {
    const {
      name, pack_type, price_xaf, credit_xaf,
      bonus_percent = 0, description, valid_days, sort_order = 0,
    } = req.body;

    if (!name || !pack_type || !price_xaf || !credit_xaf) {
      return res.status(400).json({ error: 'name, pack_type, price_xaf, credit_xaf are required' });
    }
    if (!['rider', 'driver', 'both'].includes(pack_type)) {
      return res.status(400).json({ error: 'pack_type must be rider, driver, or both' });
    }

    const { rows } = await db.query(
      `INSERT INTO wallet_credit_packs
         (name, pack_type, price_xaf, credit_xaf, bonus_percent, description,
          valid_days, sort_order, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [name, pack_type, price_xaf, credit_xaf, bonus_percent,
       description || null, valid_days || null, sort_order, req.user?.id || null]
    );
    logger.info(`[WalletPack] Pack "${name}" created by ${req.user?.id}`);
    res.status(201).json({ pack: rows[0] });
  } catch (err) {
    logger.error('[WalletPack] createPack:', err);
    res.status(500).json({ error: 'Failed to create pack' });
  }
};

// ── Admin: update pack ────────────────────────────────────────────────────────
exports.updatePack = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, pack_type, price_xaf, credit_xaf,
      bonus_percent, description, valid_days, sort_order,
    } = req.body;

    const { rows } = await db.query(
      `UPDATE wallet_credit_packs SET
         name          = COALESCE($2, name),
         pack_type     = COALESCE($3, pack_type),
         price_xaf     = COALESCE($4, price_xaf),
         credit_xaf    = COALESCE($5, credit_xaf),
         bonus_percent = COALESCE($6, bonus_percent),
         description   = COALESCE($7, description),
         valid_days    = COALESCE($8, valid_days),
         sort_order    = COALESCE($9, sort_order),
         updated_at    = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, name || null, pack_type || null, price_xaf || null, credit_xaf || null,
       bonus_percent != null ? bonus_percent : null,
       description !== undefined ? description : null,
       valid_days !== undefined ? valid_days : null,
       sort_order != null ? sort_order : null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pack not found' });
    res.json({ pack: rows[0] });
  } catch (err) {
    logger.error('[WalletPack] updatePack:', err);
    res.status(500).json({ error: 'Failed to update pack' });
  }
};

// ── Admin: toggle active ──────────────────────────────────────────────────────
exports.togglePack = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `UPDATE wallet_credit_packs SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pack not found' });
    res.json({ pack: rows[0] });
  } catch (err) {
    logger.error('[WalletPack] togglePack:', err);
    res.status(500).json({ error: 'Failed to toggle pack' });
  }
};

// ── Admin: delete pack (only if no purchases) ─────────────────────────────────
exports.deletePack = async (req, res) => {
  try {
    const { id } = req.params;
    const hasPurchases = await db.query(
      `SELECT 1 FROM wallet_pack_purchases WHERE pack_id = $1 LIMIT 1`, [id]
    );
    if (hasPurchases.rows.length) {
      return res.status(409).json({
        error: 'Cannot delete a pack that has purchases — deactivate it instead',
      });
    }
    await db.query(`DELETE FROM wallet_credit_packs WHERE id = $1`, [id]);
    res.json({ message: 'Pack deleted' });
  } catch (err) {
    logger.error('[WalletPack] deletePack:', err);
    res.status(500).json({ error: 'Failed to delete pack' });
  }
};

// ── Admin: all purchases (paginated) ─────────────────────────────────────────
exports.adminListPurchases = async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const packId = req.query.pack_id || null;

    const { rows } = await db.query(
      `SELECT pp.id, pp.user_id, pp.pack_id, pp.amount_paid_xaf, pp.credit_xaf,
              pp.bonus_xaf, pp.total_credited_xaf, pp.payment_method, pp.status,
              pp.created_at, pp.expires_at,
              wp.name AS pack_name,
              u.full_name AS user_name, u.phone AS user_phone, u.role AS user_role
       FROM wallet_pack_purchases pp
       JOIN wallet_credit_packs wp ON wp.id = pp.pack_id
       JOIN users u ON u.id = pp.user_id
       WHERE ($3::INT IS NULL OR pp.pack_id = $3)
       ORDER BY pp.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, packId ? parseInt(packId) : null]
    );
    res.json({ purchases: rows });
  } catch (err) {
    logger.error('[WalletPack] adminListPurchases:', err);
    res.status(500).json({ error: 'Failed to list purchases' });
  }
};
