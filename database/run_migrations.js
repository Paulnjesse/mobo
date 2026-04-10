/**
 * Run all MOBO SQL migrations against Supabase in order.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node database/run_migrations.js
 *
 * Or create database/.env with DATABASE_URL set.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { Client } = require('../services/ride-service/node_modules/pg');
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
];

async function run() {
  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
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
