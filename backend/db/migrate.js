#!/usr/bin/env node
//
//   node backend/db/migrate.js --status          # what is applied, what is pending
//   node backend/db/migrate.js --adopt           # record the already-applied files, execute nothing
//   node backend/db/migrate.js                   # apply every pending migration, in order
//   node backend/db/migrate.js --dry-run         # print the SQL that would run, run none of it
//   node backend/db/migrate.js --verify-rebuild  # replay ALL migrations into a throwaway schema
//
// Why this exists: the schema lived in exactly one Supabase project and could not
// be rebuilt from this repo. `backend/db/migrations/*.sql` was a RECORD of what
// someone had pasted into the SQL editor, not a MECHANISM that could reproduce it.
// Lose the project and the application was unrecoverable. check-schema.js could
// tell you the files and the database disagreed; nothing could act on the answer.
//
// The missing piece was never the SQL — it was DDL access. PostgREST executes
// queries, not DDL, so the service key cannot help. This connects to Postgres
// directly (DATABASE_URL) and is the only thing in the repo that can.
//
// THE LEDGER. `schema_migrations` records what has run. The old README argued
// against one — "with hand-applied migrations a bookkeeping table is one more
// thing to forget to update, and the database is the record". That was right for
// hand-application and is wrong now: nothing here is hand-applied, so nothing can
// forget. The ledger is written in the same transaction as the migration it
// describes, which is the one way it cannot drift.
//
// ADOPTION. The 25 existing migrations are ALREADY applied to the live database,
// by hand, with no ledger. Running them again would be safe — every file is
// idempotent — but it would be a lie: the ledger would claim we applied what we
// merely found. `--adopt` records them as `adopted`, meaning "present, not
// applied by us". A fresh database gets `false` for the same rows, and the
// difference is the whole disaster-recovery story.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SNAPSHOT = path.join(__dirname, 'schema.json');

// Two runners against one database is a corrupt ledger. Postgres hands out the
// lock or blocks; the number is arbitrary but must never change.
const ADVISORY_LOCK = 4_071_985_213;

// The ledger lives in its OWN schema, not in `public`, for two reasons. Supabase
// exposes `public` through PostgREST, so a ledger there would be a 22nd table in
// the REST API and readable with the anon key — bookkeeping has no business being
// a public endpoint. And `schema.json` is built FROM that API, so a ledger in
// `public` becomes a table every schema check reports as untracked drift, forever.
// A schema PostgREST does not serve is invisible to both problems at once.
const LEDGER_SCHEMA = 'migrations';
const LEDGER_TABLE = `${LEDGER_SCHEMA}.schema_migrations`;

const LEDGER = `
  CREATE SCHEMA IF NOT EXISTS ${LEDGER_SCHEMA};
  CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
    version      text PRIMARY KEY,
    name         text        NOT NULL,
    checksum     text        NOT NULL,
    applied_at   timestamptz NOT NULL DEFAULT now(),
    execution_ms integer,
    adopted      boolean     NOT NULL DEFAULT false
  )
`;

/* ── the files on disk ─────────────────────────────────────────────────────── */

/** `025_listing_rejection_reason.sql` → { version: '025', name: 'listing_rejection_reason' } */
function parseName(file) {
  const m = /^(\d+)_(.+)\.sql$/.exec(file);
  if (!m) throw new Error(`Migration filename is not NNN_name.sql: ${file}`);
  return { version: m[1], name: m[2] };
}

function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      return {
        file,
        ...parseName(file),
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    });
}

/* ── connecting ────────────────────────────────────────────────────────────── */

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set (backend/.env).\n\n' +
      '  Supabase Dashboard → Project Settings → Database → Connection string → URI\n' +
      '  postgresql://postgres:[PASSWORD]@db.<ref>.supabase.co:5432/postgres\n\n' +
      '  SUPABASE_SERVICE_KEY cannot substitute: it speaks PostgREST, which\n' +
      '  executes queries, not DDL.',
    );
  }
  const { Client } = require('pg');
  // Supabase terminates TLS with a certificate this client has no root for.
  // The connection is still encrypted; it is the identity that goes unchecked.
  return new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
}

/* ── reconciling the ledger against the files ──────────────────────────────── */

/**
 * Everything that can be wrong BEFORE a single statement executes. Each of these
 * is a silent corruption if it runs anyway, so every one of them is fatal.
 */
function reconcile(files, applied) {
  const byVersion = new Map(applied.map((r) => [r.version, r]));
  const problems = [];

  for (const r of applied) {
    const file = files.find((f) => f.version === r.version);
    if (!file) {
      problems.push(`${r.version}_${r.name}.sql — applied to the database, MISSING from the repo. ` +
                    'Restore the file; the database is the thing that already ran it.');
      continue;
    }
    if (file.checksum !== r.checksum) {
      problems.push(`${file.file} — EDITED since it was applied. A migration is a historical ` +
                    'record, not a document. Write a new one that makes the change; do not ' +
                    'rewrite the past.');
    }
  }

  const pending = files.filter((f) => !byVersion.has(f.version));

  // A pending migration numbered below one that has already run means two
  // branches numbered in parallel. Applying it now runs the schema's history out
  // of order — the exact bug numbering exists to prevent.
  const highest = applied.reduce((max, r) => (r.version > max ? r.version : max), '');
  for (const f of pending) {
    if (highest && f.version < highest) {
      problems.push(`${f.file} — numbered BELOW the last applied migration (${highest}). ` +
                    'Renumber it to the end; history does not get insertions.');
    }
  }

  return { pending, problems };
}

async function ledgerRows(client) {
  await client.query(LEDGER);
  const { rows } = await client.query(
    `SELECT version, name, checksum, applied_at, adopted FROM ${LEDGER_TABLE} ORDER BY version`,
  );
  return rows;
}

/* ── the commands ──────────────────────────────────────────────────────────── */

async function status(client) {
  const files = migrationFiles();
  const applied = await ledgerRows(client);
  const { pending, problems } = reconcile(files, applied);

  const adopted = applied.filter((r) => r.adopted).length;
  console.log(`${files.length} migration(s) on disk — ${applied.length} applied, ${pending.length} pending.`);
  if (adopted) console.log(`${adopted} of the applied were ADOPTED: found already present, never executed by this runner.\n`);
  else console.log('');

  for (const f of files) {
    const r = applied.find((a) => a.version === f.version);
    const mark = !r ? '·  PENDING ' : r.adopted ? '✔  adopted ' : '✔  applied ';
    const when = r ? new Date(r.applied_at).toISOString().slice(0, 10) : '';
    console.log(`  ${mark} ${f.file.padEnd(38)} ${when}`);
  }

  if (problems.length) {
    console.error('\n✘ The repo and the ledger disagree:\n');
    problems.forEach((p) => console.error('  ' + p));
    process.exit(1);
  }
  if (pending.length === 0) console.log('\n✔ The database is up to date with the repo.');
}

/**
 * Record every file as applied without executing any of it. For a database whose
 * migrations were applied by hand, before this runner existed.
 */
async function adopt(client) {
  const files = migrationFiles();
  const applied = await ledgerRows(client);
  const { pending, problems } = reconcile(files, applied);

  if (problems.length) {
    console.error('✘ Refusing to adopt — the repo and the ledger disagree:\n');
    problems.forEach((p) => console.error('  ' + p));
    process.exit(1);
  }
  if (pending.length === 0) {
    console.log('✔ Nothing to adopt — every migration is already in the ledger.');
    return;
  }

  // Adoption asserts the database ALREADY has what these files describe. If that
  // is false, we would be recording a migration that never ran, and the column it
  // creates would never appear. check-schema.js is the thing that knows, so make
  // it the gate rather than taking the claim on trust.
  const { fetchLiveSchema } = require('./schema-introspect');
  const { buildSchemaFromSql, coverageGaps } = require('./sql-coverage');
  const live = await fetchLiveSchema();
  const fromSql = buildSchemaFromSql(files.map((f) => path.join(MIGRATIONS_DIR, f.file)));
  const { unapplied } = coverageGaps(fromSql, live);

  if (unapplied.length) {
    console.error('✘ Refusing to adopt. These migrations create objects the database does NOT have,');
    console.error('  so they have not in fact been applied:\n');
    unapplied.forEach((c) => console.error(`  ✘ ${c}`));
    console.error('\n  Adopting would record them as done and they would never run.');
    console.error('  Apply them for real instead: node backend/db/migrate.js');
    process.exit(1);
  }

  for (const f of pending) {
    await client.query(
      `INSERT INTO ${LEDGER_TABLE} (version, name, checksum, adopted)
       VALUES ($1, $2, $3, true)`,
      [f.version, f.name, f.checksum],
    );
    console.log(`  adopted  ${f.file}`);
  }
  console.log(`\n✔ Adopted ${pending.length} migration(s) — recorded as present, executed none.`);
  console.log('  Verified first: every object they create already exists in the database.');
}

async function apply(client, { dryRun }) {
  const files = migrationFiles();
  const applied = await ledgerRows(client);
  const { pending, problems } = reconcile(files, applied);

  if (problems.length) {
    console.error('✘ Refusing to migrate — the repo and the ledger disagree:\n');
    problems.forEach((p) => console.error('  ' + p));
    process.exit(1);
  }
  if (pending.length === 0) {
    console.log('✔ Nothing to apply — the database is up to date with the repo.');
    return;
  }

  if (dryRun) {
    console.log(`${pending.length} migration(s) would be applied, in this order:\n`);
    for (const f of pending) {
      console.log(`── ${f.file} ${'─'.repeat(Math.max(0, 60 - f.file.length))}`);
      console.log(f.sql.trim());
      console.log('');
    }
    console.log('Nothing was executed. Drop --dry-run to apply.');
    return;
  }

  for (const f of pending) {
    const started = Date.now();
    // Postgres has transactional DDL: a migration that fails halfway leaves the
    // schema exactly as it was, and the ledger row dies with it. The ledger
    // cannot claim a migration that did not land.
    await client.query('BEGIN');
    try {
      await client.query(f.sql);
      await client.query(
        `INSERT INTO ${LEDGER_TABLE} (version, name, checksum, execution_ms, adopted)
         VALUES ($1, $2, $3, $4, false)`,
        [f.version, f.name, f.checksum, Date.now() - started],
      );
      await client.query('COMMIT');
      console.log(`  ✔ ${f.file}  (${Date.now() - started}ms)`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`\n✘ ${f.file} failed — rolled back, nothing was applied:\n`);
      console.error(`  ${e.message}`);
      if (e.position) console.error(`  at character ${e.position}`);
      console.error('\n  The schema is unchanged. Fix the migration and run again.');
      process.exit(1);
    }
  }
  console.log(`\n✔ Applied ${pending.length} migration(s).`);
  console.log('  Refresh the snapshot next: npm run db:snapshot');
}

/**
 * The disaster-recovery drill, and the only thing that actually answers "can we
 * rebuild this?". Replays every migration from 001 into an empty throwaway schema
 * and diffs the result against schema.json.
 *
 * It runs inside a transaction that is ALWAYS rolled back, so it commits nothing
 * — which is what makes it safe to point at the one database that exists. The
 * migrations never name a schema, so `search_path` alone redirects every CREATE
 * into the sandbox; check that assumption holds before trusting this (a stray
 * `public.` in a new migration would write to the real schema, and the rollback
 * would still take it back out).
 *
 * check-schema.js --coverage answers a WEAKER question against the same files: it
 * PARSES the SQL and compares what it thinks the statements mean. This EXECUTES
 * them. Postgres is the only parser whose opinion counts, and it is the only one
 * that will notice a CHECK constraint, an index, a trigger or a function — none
 * of which PostgREST can see.
 */
async function verifyRebuild(client) {
  const files = migrationFiles();
  if (!fs.existsSync(SNAPSHOT)) throw new Error('No schema.json. Generate one with: npm run db:snapshot');
  const expected = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const sandbox = `rebuild_check_${Date.now()}`;

  const leaks = files.filter((f) => /\bpublic\./i.test(f.sql));
  if (leaks.length) {
    console.error('✘ These migrations name the `public` schema explicitly, so they would write to the');
    console.error('  REAL schema rather than the sandbox. Refusing to run:\n');
    leaks.forEach((f) => console.error(`  ✘ ${f.file}`));
    process.exit(1);
  }

  console.log(`Replaying ${files.length} migration(s) into an empty schema, from 001.\n`);
  await client.query('BEGIN');
  try {
    await client.query(`CREATE SCHEMA ${sandbox}`);
    await client.query(`SET LOCAL search_path TO ${sandbox}`);

    for (const f of files) {
      const started = Date.now();
      try {
        await client.query(f.sql);
        console.log(`  ✔ ${f.file}  (${Date.now() - started}ms)`);
      } catch (e) {
        console.error(`\n✘ ${f.file} does not execute against an empty database:\n`);
        console.error(`  ${e.message}`);
        console.error('\n  This is the rebuild failing. The schema CANNOT currently be reconstructed');
        console.error('  from this repo. Fix the migration.');
        await client.query('ROLLBACK');
        process.exit(1);
      }
    }

    // What did we actually build? Ask Postgres, not the SQL.
    const { rows } = await client.query(
      `SELECT table_name, column_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema = $1
        ORDER BY table_name, column_name`,
      [sandbox],
    );
    const built = new Map();
    for (const r of rows) {
      if (!built.has(r.table_name)) built.set(r.table_name, new Set());
      built.get(r.table_name).add(r.column_name);
    }

    // Objects PostgREST could never see, and which therefore no existing check
    // has ever verified. Their mere existence is the news.
    const { rows: extras } = await client.query(
      `SELECT
         (SELECT count(*) FROM pg_constraint  c JOIN pg_namespace n ON n.oid = c.connamespace
           WHERE n.nspname = $1 AND c.contype = 'c')                       AS checks,
         (SELECT count(*) FROM pg_indexes     WHERE schemaname = $1)       AS indexes,
         (SELECT count(*) FROM pg_trigger     t JOIN pg_class cl ON cl.oid = t.tgrelid
                                              JOIN pg_namespace n ON n.oid = cl.relnamespace
           WHERE n.nspname = $1 AND NOT t.tgisinternal)                    AS triggers,
         (SELECT count(*) FROM pg_proc        p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = $1)                                           AS functions`,
      [sandbox],
    );

    const problems = [];
    for (const [table, spec] of Object.entries(expected.tables)) {
      if (!built.has(table)) { problems.push(`table  ${table} — in schema.json, built by no migration`); continue; }
      for (const col of Object.keys(spec.columns)) {
        if (!built.get(table).has(col)) problems.push(`column ${table}.${col} — in schema.json, built by no migration`);
      }
    }
    for (const [table, cols] of built) {
      if (!expected.tables[table]) { problems.push(`table  ${table} — built by a migration, absent from schema.json`); continue; }
      for (const col of cols) {
        if (!expected.tables[table].columns[col]) problems.push(`column ${table}.${col} — built by a migration, absent from schema.json`);
      }
    }

    const e = extras[0];
    console.log(`\nRebuilt ${built.size} tables, ${rows.length} columns.`);
    console.log(`Also built, and invisible to every other check: ${e.checks} CHECK constraint(s), ` +
                `${e.indexes} index(es), ${e.triggers} trigger(s), ${e.functions} function(s).`);

    if (problems.length) {
      console.error(`\n✘ The rebuilt schema does not match schema.json:\n`);
      problems.forEach((p) => console.error('  ' + p));
      await client.query('ROLLBACK');
      process.exit(1);
    }

    console.log('\n✔ REBUILD VERIFIED. backend/db/migrations/ reconstructs the schema from nothing,');
    console.log('  and Postgres — not a parser — is what says so.');
  } finally {
    // The sandbox never existed. DDL is transactional; the rollback takes the
    // schema, its tables, its triggers and its functions with it.
    await client.query('ROLLBACK').catch(() => {});
  }
}

/* ── entry ─────────────────────────────────────────────────────────────────── */

const MODES = {
  '--status': status,
  '--adopt': adopt,
  '--verify-rebuild': verifyRebuild,
  '--dry-run': (c) => apply(c, { dryRun: true }),
};

async function main() {
  const mode = process.argv[2];
  if (mode && !MODES[mode]) throw new Error(`Unknown mode: ${mode}. See the header of this file.`);
  const run = mode ? MODES[mode] : (c) => apply(c, { dryRun: false });

  const client = connect();
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK]);
    await run(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK]).catch(() => {});
    await client.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
