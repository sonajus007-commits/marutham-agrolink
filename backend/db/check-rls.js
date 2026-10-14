#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Row-level-security guard.
//
//   node backend/db/check-rls.js        (pure static analysis — NO database)
//
// Supabase publishes every table in `public` through its REST API, and the anon
// key that unlocks that API ships inside every client. A table with RLS OFF is
// therefore readable and writable by anyone on the internet — no backend, no
// auth, no audit trail. order_proofs (delivery photos with GPS) and expenses sat
// like that until 067, because tables created by SQL start with RLS off; only the
// dashboard's Table Editor turns it on for you.
//
// The convention here: every table has RLS ON and, almost always, NO policies.
// That denies anon/authenticated outright, and the backend is unaffected because
// it uses the service-role key, which bypasses RLS.
//
// THE RULE: every table — each one in schema.json, and each one a migration
// creates — must be left with RLS enabled by the migrations, replayed in order.
// Checking the migrations rather than the live database means it runs in CI, and
// it means a database REBUILT from migrations is as locked down as the live one.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SNAPSHOT = path.join(__dirname, 'schema.json');

const NAME = String.raw`(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?`;
const CREATE_RE = new RegExp(String.raw`\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?${NAME}`, 'gi');
const RLS_RE = new RegExp(
  String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}\s+(enable|disable)\s+row\s+level\s+security`,
  'gi',
);

const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

// sqlFiles: [{ name, sql }] in apply order. Returns the sorted table names whose
// RLS is not enabled once every migration has run.
function tablesWithoutRls(sqlFiles, snapshotTables = []) {
  const tables = new Set(snapshotTables);
  const rls = new Map();
  for (const { sql } of sqlFiles) {
    const clean = stripComments(sql);
    for (const m of clean.matchAll(CREATE_RE)) tables.add(m[1].toLowerCase());
    // Last statement wins, so a later DISABLE re-opens a table.
    for (const m of clean.matchAll(RLS_RE)) rls.set(m[1].toLowerCase(), m[2].toLowerCase() === 'enable');
  }
  return [...tables].filter((t) => !rls.get(t)).sort();
}

function main() {
  const sqlFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8') }));
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const missing = tablesWithoutRls(sqlFiles, Object.keys(snapshot.tables));

  if (missing.length === 0) {
    console.log(`✔ Every table has RLS enabled by a migration (${sqlFiles.length} migrations).`);
    return;
  }
  console.error(`✘ ${missing.length} table(s) without RLS enabled by any migration:\n`);
  missing.forEach((t) => console.error(`  ${t}`));
  console.error('\nAdd to the migration that creates the table:');
  console.error('  alter table <name> enable row level security;');
  console.error('No policies needed — the backend uses the service-role key, which bypasses RLS.');
  process.exit(1);
}

if (require.main === module) main();

module.exports = { tablesWithoutRls };
