/**
 * rotate_db_passwords.js — SEC-004 credential rotation
 *
 * Reads per-role passwords from environment variables and issues
 * ALTER ROLE ... PASSWORD statements against the database.
 *
 * Usage (run ONCE after migration_036.sql, then again whenever you rotate):
 *
 *   DATABASE_URL="postgresql://..." \
 *   MOBO_USER_SVC_PASSWORD="<strong-random>" \
 *   MOBO_RIDE_SVC_PASSWORD="<strong-random>" \
 *   MOBO_PAY_SVC_PASSWORD="<strong-random>"  \
 *   MOBO_LOC_SVC_PASSWORD="<strong-random>"  \
 *   MOBO_READONLY_PASSWORD="<strong-random>" \
 *   node database/rotate_db_passwords.js
 *
 * After rotation, update the per-service DATABASE_URL env vars in
 * Render Dashboard to use the new credentials:
 *   mobo_user_svc : postgresql://mobo_user_svc:<password>@host/dbname
 *   mobo_ride_svc : postgresql://mobo_ride_svc:<password>@host/dbname
 *   mobo_pay_svc  : postgresql://mobo_pay_svc:<password>@host/dbname
 *   mobo_loc_svc  : postgresql://mobo_loc_svc:<password>@host/dbname
 *   mobo_readonly : postgresql://mobo_readonly:<password>@host/dbname
 */
'use strict';

try {
  require('./node_modules/dotenv').config({ path: require('path').join(__dirname, '.env') });
} catch {
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
}

let Client;
try {
  ({ Client } = require('./node_modules/pg'));
} catch {
  ({ Client } = require('../services/ride-service/node_modules/pg'));
}

const ROLES = [
  { role: 'mobo_user_svc', envVar: 'MOBO_USER_SVC_PASSWORD' },
  { role: 'mobo_ride_svc', envVar: 'MOBO_RIDE_SVC_PASSWORD' },
  { role: 'mobo_pay_svc',  envVar: 'MOBO_PAY_SVC_PASSWORD'  },
  { role: 'mobo_loc_svc',  envVar: 'MOBO_LOC_SVC_PASSWORD'  },
  { role: 'mobo_readonly', envVar: 'MOBO_READONLY_PASSWORD'  },
];

const CONNECTION_STRING = process.env.DATABASE_URL;
if (!CONNECTION_STRING) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

// Validate all passwords are provided and not CHANGE_ME placeholders
const missing = ROLES.filter(({ envVar }) => {
  const val = process.env[envVar];
  return !val || val.startsWith('CHANGE_ME');
});
if (missing.length > 0) {
  console.error('ERROR: Missing or placeholder passwords for:');
  missing.forEach(({ envVar }) => console.error(`  ${envVar}`));
  console.error('\nSet all 5 env vars to strong random values before running.');
  process.exit(1);
}

function buildSsl() {
  if (process.env.NODE_ENV === 'test') return false;
  const cfg = { rejectUnauthorized: true };
  if (process.env.DB_SSL_CA) cfg.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  return cfg;
}

async function rotate() {
  const client = new Client({ connectionString: CONNECTION_STRING, ssl: buildSsl() });
  await client.connect();
  console.log('✓ Connected\n');

  for (const { role, envVar } of ROLES) {
    const password = process.env[envVar];
    try {
      // Use parameterized identifier quoting — password is a literal string value
      await client.query(`ALTER ROLE ${role} PASSWORD $1`, [password]);
      console.log(`✓  ${role} password rotated`);
    } catch (err) {
      // Role may not exist if migration_036 hasn't run yet
      console.error(`✗  ${role} — ${err.message}`);
    }
  }

  await client.end();
  console.log('\nRotation complete. Update Render env vars with new per-service DATABASE_URLs.');
}

rotate().catch((err) => {
  console.error('Connection failed:', err.message);
  process.exit(1);
});
