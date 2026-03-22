/**
 * Run all MOBO SQL migrations against Supabase in order.
 */
const { Client } = require('../services/ride-service/node_modules/pg');
const fs = require('fs');
const path = require('path');

const CONNECTION_STRING = "postgresql://postgres:Douala@1234$@db.bkanmaljfqgsxnthqnmp.supabase.co:5432/postgres";

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
