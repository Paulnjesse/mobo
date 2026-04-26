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
  'migration_037.sql',  // Production indexes, constraints, and deduplication tables
  'migration_038.sql',  // Saga pattern: earnings_pending table for payment settlement
  'migration_039.sql',  // Admin dashboard support tables + user soft-delete archive
  'migration_040.sql',  // ride_events audit log, finance:read RBAC, quarterly partitions
  'migration_041.sql',  // Atomic partition rename, stripe_payment_intent_id, fare_splits
  'migration_042.sql',  // Performance indexes for hot query paths (CONCURRENTLY)
  'migration_043.sql',  // ride_waypoints + incidents + revoked_tokens (CF-003, CF-005, CF-004)
  'migration_044.sql',  // ad_platform_config (AdMob + AdSense) + app_splash_config (animated splash)
  'migration_045.sql',  // wallet_credit_packs + wallet_pack_purchases + loyalty_bonus_log + spend tracking
  'migration_046.sql',  // driver_locations.accuracy_m column for GPS accuracy storage
  'migration_047.sql',  // Performance indexes: rides(status,created_at), users(phone), payments(user_id,created_at)
  'migration_048.sql',  // BGC columns (drivers), messages attachments, insurance_claims table
];

function buildMigrationSsl() {
  // Supabase and Render PostgreSQL require SSL. In CI/test we skip if no URL.
  // rejectUnauthorized: true validates the server certificate (prevents MITM).
  // If DB_SSL_CA is set, pin to that CA; otherwise trust the system CA bundle.
  // DB_SSL_NO_VERIFY=true disables cert validation (for Supabase hosted, which
  // uses a self-signed CA not in the system bundle — still encrypted in transit).
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.DB_SSL_NO_VERIFY === 'true') return { rejectUnauthorized: false };
  const sslConfig = { rejectUnauthorized: true };
  if (process.env.DB_SSL_CA) {
    sslConfig.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  }
  return sslConfig;
}

/**
 * Split a SQL file into individual statements, respecting:
 *   • Dollar-quoted strings  ($$ ... $$  or  $tag$ ... $tag$)
 *   • Single-quoted strings  ('...')
 *   • Line comments          (-- ...)
 *   • Block comments         (/* ... *\/)
 * Returns an array of non-empty statement strings.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    // Dollar-quote: $$...$$  or  $tag$...$tag$
    if (sql[i] === '$') {
      const dollarEnd = sql.indexOf('$', i + 1);
      if (dollarEnd !== -1) {
        const tag = sql.slice(i, dollarEnd + 1);
        const closeIdx = sql.indexOf(tag, dollarEnd + 1);
        if (closeIdx !== -1) {
          current += sql.slice(i, closeIdx + tag.length);
          i = closeIdx + tag.length;
          continue;
        }
      }
    }

    // Single-quoted string
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // Block comment  /* ... */
    if (sql[i] === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const closeAt = end === -1 ? sql.length : end + 2;
      current += sql.slice(i, closeAt);
      i = closeAt;
      continue;
    }

    // Line comment  -- ...
    if (sql[i] === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl + 1;
      current += sql.slice(i, end);
      i = end;
      continue;
    }

    // Statement terminator
    if (sql[i] === ';') {
      current += ';';
      const trimmed = current.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (trimmed && trimmed !== ';') {
        statements.push(current.trim());
      }
      current = '';
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  // Flush any trailing statement without a semicolon
  const trimmed = current.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (trimmed) statements.push(current.trim());

  return statements;
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

    // Execute statement-by-statement so CREATE INDEX CONCURRENTLY
    // runs in its own autocommit context rather than a multi-statement block.
    const stmts = splitStatements(sql);
    let fileErrors = 0;
    for (const stmt of stmts) {
      try {
        await client.query(stmt);
      } catch (err) {
        // Swallow "already exists" / idempotency errors silently;
        // surface anything else as a warning.
        const msg = err.message || '';
        const isIdempotent = /already exists|does not exist|duplicate_object/i.test(msg);
        if (!isIdempotent) {
          console.warn(`  ⚠  ${file}: ${msg.split('\n')[0]}`);
          fileErrors++;
        }
      }
    }
    if (fileErrors === 0) {
      console.log(`✓  ${file}`);
    } else {
      console.log(`⚠  ${file} — completed with ${fileErrors} non-idempotency warning(s)`);
    }
  }

  await client.end();
  console.log('\nDone.');
}

run().catch((err) => {
  console.error('Connection failed:', err.message);
  process.exit(1);
});
