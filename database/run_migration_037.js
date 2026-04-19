'use strict';
/**
 * run_migration_037.js
 * Executes migration_037.sql against Supabase, statement by statement.
 * Handles DO $$ ... $$ blocks and CONCURRENTLY indexes (can't run in transactions).
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const sql = fs.readFileSync(path.join(__dirname, 'migration_037.sql'), 'utf8');

/**
 * Split SQL into statements. Handles:
 *  - $$ dollar-quoted blocks (DO $$ ... $$)
 *  - $tag$ dollar-quoted blocks (EXECUTE $idx$ ... $idx$)
 *  - Standard semicolon-delimited statements
 *  - Line comments (-- ...)
 */
function splitStatements(sql) {
  const stmts = [];
  let buf = '';
  let i = 0;
  let dollarTag = null;

  while (i < sql.length) {
    // Skip line comments outside dollar quotes
    if (!dollarTag && sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    // Check for dollar-quote opening: $[identifier]$
    if (!dollarTag) {
      const m = sql.slice(i).match(/^(\$[A-Za-z0-9_]*\$)/);
      if (m) {
        dollarTag = m[1];
        buf += m[1];
        i += m[1].length;
        continue;
      }
    } else {
      // Check for closing dollar-quote
      if (sql.slice(i, i + dollarTag.length) === dollarTag) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
    }

    const ch = sql[i];

    // Semicolon terminates statement (only outside dollar quotes)
    if (!dollarTag && ch === ';') {
      const stmt = buf.trim();
      if (stmt.length > 0) stmts.push(stmt + ';');
      buf = '';
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  const remaining = buf.trim();
  if (remaining) stmts.push(remaining);

  return stmts.filter(s => s.replace(/;$/, '').trim().length > 0);
}

async function run() {
  const stmts = splitStatements(sql);
  console.log(`Parsed ${stmts.length} statements from migration_037.sql`);

  const client = new Client(process.env.DATABASE_URL);
  await client.connect();
  console.log('Connected to Supabase (PostgreSQL)');

  let ok = 0, skip = 0;
  const errors = [];

  for (let idx = 0; idx < stmts.length; idx++) {
    const stmt = stmts[idx];
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    try {
      await client.query(stmt);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      // 42P07 = duplicate_table, 42710 = duplicate_object (index/constraint already exists)
      if (['42P07', '42710'].includes(e.code)) {
        skip++;
        process.stdout.write('s');
      } else if (e.code === '42703') {
        // column does not exist — guarded statement, skip safely
        skip++;
        process.stdout.write('s');
      } else {
        errors.push({ idx: idx + 1, preview, code: e.code, msg: e.message });
        process.stdout.write('E');
      }
    }
  }

  console.log('\n');
  console.log(`Done: ${ok} succeeded, ${skip} skipped (already exists), ${errors.length} errors`);

  if (errors.length > 0) {
    console.error('\nErrors:');
    errors.forEach(e => {
      console.error(`  [${e.idx}] ${e.code}: ${e.msg}`);
      console.error(`       ${e.preview}`);
    });
  }

  await client.end();
  process.exit(errors.length > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
