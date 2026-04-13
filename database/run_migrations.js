/**
 * Run all MOBO SQL migrations against Supabase in order.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node database/run_migrations.js
 *
 * Or create database/.env with DATABASE_URL set.
 */
// Support dotenv from database/node_modules or ride-service/node_modules
try {
  require('./node_modules/dotenv').config({ path: require('path').join(__dirname, '.env') });
} catch {
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
}

// Support pg from database/node_modules or ride-service/node_modules
let Client;
try {
  ({ Client } = require('./node_modules/pg'));
} catch {
  ({ Client } = require('../services/ride-service/node_modules/pg'));
}
const fs = require('fs');
const path = require('path');

const CONNECTION_STRING = process.env.DATABASE_URL;
if (!CONNECTION_STRING) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  console.error('Set it in database/.env or export it before running this script.');
  process.exit(1);
}

const FILES = [
  'init.sql',
  'migration_001.sql',
  'migration_002.sql',
  'migration_003.sql',
  'migration_004.sql',
  'migration_005.sql',
  'migration_006.sql',
  'migration_007.sql',
  'migration_008.sql',
  'migration_009.sql',
  'migration_010.sql',
  'migration_011.sql',
  'migration_012.sql',
  'migration_013.sql',
  'migration_014.sql',
  'migration_015.sql',
  'migration_016.sql',
  'migration_017.sql',
  'migration_018.sql',
  'migration_019.sql',
  'seed.sql',
  'migration_020.sql',
  'migration_021.sql',
  'migration_022.sql',
  'migration_023.sql',
  'migration_024.sql',
  'migration_025.sql',
  'migration_026.sql',
  'migration_027.sql',  // Message TTL + country_currency_config table
  'migration_028.sql',  // country_code column on users + preferred_currency
  'migration_029.sql',  // Teen account safety: date_of_birth, curfew, teen_ride_log
  'migration_030.sql',  // GDPR consent management: user_consents, consent_audit_log, consent_purposes
  'migration_031.sql',  // Surge price cap: max_multiplier on surge_zones (3.50× ceiling)
  'migration_032.sql',  // MOBO Hourly 10h package + rider identity verification + share-trip live location
  'migration_033.sql',  // Soft deletes + admin_roles table + read_only/read_write roles + new permissions
  'migration_034.sql',  // data_access_logs + admin_notifications + user_documents (encrypted)
  'migration_035.sql',  // vehicle_categories + vehicle_inspections + driver_selfie_checks + police_contacts
  'migration_036.sql',  // SEC-004: least-privilege DB roles (mobo_user_svc, mobo_ride_svc, mobo_pay_svc, mobo_loc_svc, mobo_readonly)
];

function buildMigrationSsl() {
  // Supabase and Render PostgreSQL require SSL. In CI/test we skip if no URL.
  // rejectUnauthorized: true validates the server certificate (prevents MITM).
  // If DB_SSL_CA is set, pin to that CA; otherwise trust the system CA bundle.
  if (process.env.NODE_ENV === 'test') return false;
  const sslConfig = { rejectUnauthorized: true };
  if (process.env.DB_SSL_CA) {
    sslConfig.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  }
  return sslConfig;
}

async function run() {
  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: buildMigrationSsl(),
  });

  await client.connect();
  console.log('✓ Connected to Supabase\n');

  const dir = __dirname;

  for (const file of FILES) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠  Skipping ${file} — file not found`);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      await client.query(sql);
      console.log(`✓  ${file}`);
    } catch (err) {
      console.error(`✗  ${file} — ${err.message}`);
      // Continue with remaining files even if one fails
    }
  }

  await client.end();
  console.log('\nDone.');
}

run().catch((err) => {
  console.error('Connection failed:', err.message);
  process.exit(1);
});
