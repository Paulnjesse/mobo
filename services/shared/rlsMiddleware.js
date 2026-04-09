'use strict';
/**
 * Row-Level Security (RLS) middleware.
 *
 * Sets the PostgreSQL session variable `app.current_user_id` so that the RLS
 * policies defined in migration_025.sql are enforced for every query made
 * during the request lifecycle.
 *
 * Usage — mount AFTER the `authenticate` middleware in each service:
 *
 *   const { rlsMiddleware } = require('../../shared/rlsMiddleware');
 *   app.use('/users', authenticate, rlsMiddleware(db), profileRoutes);
 *
 * How it works:
 *   1. Acquire a dedicated client from the pool for this request.
 *   2. SET LOCAL app.current_user_id inside a transaction so the setting is
 *      scoped to that client and cannot bleed across pool connections.
 *   3. Expose the client as `req.dbClient` for controllers that need it.
 *   4. On response finish, roll back the transaction and release the client.
 *
 * Controllers that do NOT use req.dbClient fall back to the shared pool — they
 * are still protected because pool connections are stateless between requests.
 * The RLS setting only matters for the dedicated per-request client.
 */

const logger = require('./logger');

/**
 * @param {object} db  — The service's database module (must expose `pool`).
 * @returns {import('express').RequestHandler}
 */
function rlsMiddleware(db) {
  return async (req, res, next) => {
    const userId = req.user?.id || req.user?.userId;

    // No authenticated user — skip RLS context (public routes, health checks).
    if (!userId) return next();

    let client;
    try {
      client = await db.pool.connect();
      // Open a transaction so SET LOCAL is scoped to this connection checkout.
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', String(userId)]);

      // Attach to request so controllers can opt-in to the RLS-scoped client.
      req.dbClient = client;

      // Release the client when the response is finished.
      const release = () => {
        if (!client._released) {
          client._released = true;
          client.query('ROLLBACK').catch(() => {}).finally(() => client.release());
        }
      };
      res.on('finish', release);
      res.on('close',  release);

      next();
    } catch (err) {
      logger.error('[RLS] Failed to set user context', { error: err.message, userId });
      if (client) client.release();
      next(); // Degrade gracefully — do not block the request on RLS setup failure.
    }
  };
}

module.exports = { rlsMiddleware };
