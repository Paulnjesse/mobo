const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Read replica pool (falls back to primary if DATABASE_READ_URL not set)
const readPool = process.env.DATABASE_READ_URL
  ? new Pool({
      connectionString: process.env.DATABASE_READ_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      max: 20,  // higher limit for reads
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : pool;

pool.on('connect', () => {
  console.log('[RideService DB] Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
});

readPool.on('error', (err) => {
  console.error('[DB Read] Pool error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  queryRead: (text, params) => readPool.query(text, params),
  getClient: () => pool.connect(),
  end: () => Promise.all([pool.end(), readPool !== pool ? readPool.end() : Promise.resolve()]),
  pool
};
