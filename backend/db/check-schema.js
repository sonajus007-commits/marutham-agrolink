#!/usr/bin/env node
//
//   node backend/db/check-schema.js            # drift: live DB vs schema.json
//   node backend/db/check-schema.js --write    # regenerate schema.json from the live DB
//   node backend/db/check-schema.js --coverage # can the migrations rebuild the live DB?
//   node backend/db/check-schema.js --offline  # can the migrations rebuild schema.json?  (no DB)
//
// Why this exists: nothing in this repo can execute DDL (no psql, no
// DATABASE_URL, no exec_sql RPC), so migrations are applied by hand in the
// Supabase SQL editor. Hand-application means someone eventually forgets — and
// someone did: users.delivery_addresses was referenced by PATCH /auth/me for
// months while the column did not exist, silently 500ing every address save.
//
// The database is the record of what was applied. This checks the repo against
// it, in both directions, so that class of bug becomes a failing command.

const fs = require('fs');
const path = require('path');
const { fetchLiveSchema, diffSchemas } = require('./schema-introspect');
const { buildSchemaFromSql, coverageGaps } = require('./sql-coverage');

const SNAPSHOT = path.join(__dirname, 'schema.json');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const migrationFiles = () =>
  fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(MIGRATIONS_DIR, f));

function countColumns(schema) {
  return Object.values(schema.tables).reduce((n, t) => n + Object.keys(t.columns).length, 0);
}

async function write() {
  const live = await fetchLiveSchema();
  fs.writeFileSync(SNAPSHOT, JSON.stringify(live, null, 2) + '\n');
  console.log(`Wrote ${path.relative(process.cwd(), SNAPSHOT)} — ${Object.keys(live.tables).length} tables, ${countColumns(live)} columns.`);
}

async function drift() {
  if (!fs.existsSync(SNAPSHOT)) {
    console.error('No schema.json. Generate one with: npm run db:snapshot');
    process.exit(1);
  }
  const expected = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const live = await fetchLiveSchema();
  const lines = diffSchemas(expected, live);

  if (lines.length === 0) {
    console.log(`✔ Database matches schema.json (${Object.keys(live.tables).length} tables, ${countColumns(live)} columns).`);
    return;
  }
  console.error(`✘ ${lines.length} difference(s) between schema.json and the database:\n`);
  lines.forEach((l) => console.error('  ' + l));
  console.error('\nApply the missing migration, or refresh the snapshot with: npm run db:snapshot');
  process.exit(1);
}

async function coverage() {
  const files = migrationFiles();
  const sqlSchema = buildSchemaFromSql(files);
  const live = await fetchLiveSchema();
  const { missingTables, missingColumns, unapplied } = coverageGaps(sqlSchema, live);

  console.log(`Replayed ${files.length} migrations → ${sqlSchema.tables.size} tables.`);
  console.log(`Live database → ${Object.keys(live.tables).length} tables, ${countColumns(live)} columns.\n`);

  if (sqlSchema.unparsed.length) {
    console.log('Statements the parser could not read (verify these by hand):');
    sqlSchema.unparsed.forEach((u) => console.log('  ? ' + u));
    console.log('');
  }

  let bad = false;

  if (missingTables.length || missingColumns.length) {
    bad = true;
    console.error('NOT REPRODUCIBLE — present in the database, created by no migration:');
    missingTables.forEach((t) => console.error(`  ✘ table  ${t}`));
    missingColumns.forEach((c) => console.error(`  ✘ column ${c}`));
    console.error('\n  A fresh database built from backend/db/migrations/ would lack these.\n');
  }

  if (unapplied.length) {
    console.error('NOT APPLIED — created by a migration, absent from the database:');
    unapplied.forEach((c) => console.error(`  ✘ ${c}`));
    console.error('');
  }

  if (!bad && !unapplied.length) {
    console.log('✔ Every live table and column is created by a checked-in migration,');
    console.log('  and every migrated object exists in the database.');
    console.log('\n  Note: this compares tables and columns only. CHECK constraints,');
    console.log('  indexes, triggers, functions and RLS policies are invisible to');
    console.log('  PostgREST and are NOT verified here.');
    return;
  }
  process.exit(1);
}

/**
 * The same reproducibility question as --coverage, but against the committed
 * snapshot instead of the live database — so it needs no credentials and can
 * run in CI. Catches the common case: a column is added to the database and
 * snapshotted, but nobody writes the migration.
 */
function offline() {
  if (!fs.existsSync(SNAPSHOT)) {
    console.error('No schema.json. Generate one with: npm run db:snapshot');
    process.exit(1);
  }
  const expected = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const files = migrationFiles();
  const sqlSchema = buildSchemaFromSql(files);
  const { missingTables, missingColumns, unapplied } = coverageGaps(sqlSchema, expected);

  console.log(`Replayed ${files.length} migrations → ${sqlSchema.tables.size} tables.`);
  console.log(`schema.json → ${Object.keys(expected.tables).length} tables, ${countColumns(expected)} columns.\n`);

  if (sqlSchema.unparsed.length) {
    console.log('Statements the parser could not read (verify these by hand):');
    sqlSchema.unparsed.forEach((u) => console.log('  ? ' + u));
    console.log('');
  }

  if (missingTables.length || missingColumns.length || unapplied.length) {
    console.error('The migrations do not reproduce schema.json:\n');
    missingTables.forEach((t) => console.error(`  ✘ table  ${t} — in the snapshot, created by no migration`));
    missingColumns.forEach((c) => console.error(`  ✘ column ${c} — in the snapshot, created by no migration`));
    unapplied.forEach((c) => console.error(`  ✘ ${c} — created by a migration, absent from the snapshot`));
    console.error('\nEither write the missing migration, or refresh the snapshot: npm run db:snapshot');
    process.exit(1);
  }

  console.log('✔ backend/db/migrations/ reproduces every table and column in schema.json.');
  console.log('\n  Tables and columns only — CHECK constraints, indexes, triggers and RLS');
  console.log('  policies are not represented in the snapshot.');
}

const mode = process.argv[2];
const run =
  mode === '--write' ? write :
  mode === '--coverage' ? coverage :
  mode === '--offline' ? async () => offline() :
  drift;

run().catch((e) => { console.error(e.message); process.exit(1); });
