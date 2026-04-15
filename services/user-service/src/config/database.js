const logger = require('../utils/logger');
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Build the SSL configuration for PostgreSQL connections.
 *
 * In production:
 *   - rejectUnauthorized: true  → validates the server's certificate chain
 *   - ca: DB_SSL_CA             → PEM-encoded CA cert provided by Render/Supabase/RDS
 *
 * To get DB_SSL_CA on Render:
 *   Dashboard → PostgreSQL instance → Connection → Download CA Certificate
 *   Store the PEM content as a single-line env var (replace newlines with \n).
 *
 * In development/test: SSL disabled (local Postgres has no cert).
 */
function buildSslConfig() {
  if (!isProduction) return false;

  const sslConfig = { rejectUnauthorized: true };

  if (process.env.DB_SSL_CA) {
    // Allow \n literals in env var to be converted back to actual newlines
    sslConfig.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  } else {
    // If no CA cert provided, still enforce validation using system trust store.
    // This protects against MITM while trusting well-known CAs (e.g. Let's Encrypt).
    logger.warn('[DB] DB_SSL_CA not set — using system CA bundle. Set DB_SSL_CA for full pinning.');
  }

  return sslConfig;
}

const sslConfig = buildSslConfig();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
  statement_timeout: 10_000,       // kill queries running > 10s (prevents slow-query DoS)
  query_timeout:     15_000,
});

// Read replica pool (falls back to primary if DATABASE_READ_URL not set)
const readPool = process.env.DATABASE_READ_URL
  ? new Pool({
      connectionString: process.env.DATABASE_READ_URL,
      ssl: sslConfig,
      max: 30,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
      query_timeout:     15_000,
    })
  : pool;

pool.on('connect', () => {
  logger.info('[UserService DB] Connected to PostgreSQL');
});

pool.on('error', (err) => {
  logger.error('[DB] Pool error:', err.message);
});

readPool.on('error', (err) => {
  logger.error('[DB Read] Pool error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  queryRead: (text, params) => readPool.query(text, params),
  getClient: () => pool.connect(),
  end: () => Promise.all([pool.end(), readPool !== pool ? readPool.end() : Promise.resolve()]),
  pool
};
