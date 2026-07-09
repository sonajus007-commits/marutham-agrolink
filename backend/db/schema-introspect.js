// Read the live schema out of PostgREST's OpenAPI document.
//
// This is the only introspection channel available: there is no psql, no
// DATABASE_URL, and no exec_sql RPC, and PostgREST does not expose pg_catalog.
//
// WHAT IT SEES: tables, columns, Postgres types, NOT NULL, defaults, primary
// keys, foreign keys.
// WHAT IT CANNOT SEE: CHECK constraints, indexes, triggers, functions, RLS
// policies, and sequence ownership. Do not treat the snapshot as a complete
// schema — it is a contract for the columns the application depends on.

const PK_RE = /<pk\/>/;
const FK_RE = /<fk table='([^']+)' column='([^']+)'\/>/;

/* Loaded lazily and optionally: the --offline check runs in CI, where
 * backend/node_modules is not installed and no database is reachable. */
function loadEnv() {
  try {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  } catch {
    /* dotenv absent — fall back to the ambient environment */
  }
}

async function fetchLiveSchema() {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (backend/.env).');

  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`PostgREST returned ${res.status} for the OpenAPI document.`);
  const doc = await res.json();
  const defs = doc.definitions || {};

  const tables = {};
  for (const [table, spec] of Object.entries(defs)) {
    const required = new Set(spec.required || []);
    const columns = {};
    for (const [name, prop] of Object.entries(spec.properties || {})) {
      const desc = prop.description || '';
      const fk = desc.match(FK_RE);
      columns[name] = {
        type: prop.format || prop.type,
        notNull: required.has(name),
        ...(prop.default !== undefined ? { default: String(prop.default) } : {}),
        ...(PK_RE.test(desc) ? { primaryKey: true } : {}),
        ...(fk ? { references: `${fk[1]}.${fk[2]}` } : {}),
      };
    }
    tables[table] = { columns: sortKeys(columns) };
  }
  return { tables: sortKeys(tables) };
}

function sortKeys(obj) {
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
}

/** Structural diff. Returns a list of human-readable drift lines. */
function diffSchemas(expected, live) {
  const drift = [];
  const eT = expected.tables || {};
  const lT = live.tables || {};

  for (const t of Object.keys(eT)) {
    if (!lT[t]) { drift.push(`MISSING TABLE   ${t} — expected by the repo, absent from the database`); continue; }
    for (const [c, spec] of Object.entries(eT[t].columns)) {
      const got = lT[t].columns[c];
      if (!got) { drift.push(`MISSING COLUMN  ${t}.${c} — a migration has not been applied`); continue; }
      if (got.type !== spec.type) drift.push(`TYPE CHANGED    ${t}.${c} — expected ${spec.type}, database has ${got.type}`);
      if (!!got.notNull !== !!spec.notNull) drift.push(`NULLABILITY     ${t}.${c} — expected ${spec.notNull ? 'NOT NULL' : 'nullable'}`);
    }
  }

  for (const t of Object.keys(lT)) {
    if (!eT[t]) { drift.push(`UNTRACKED TABLE ${t} — exists in the database, not in the snapshot`); continue; }
    for (const c of Object.keys(lT[t].columns)) {
      if (!eT[t].columns[c]) drift.push(`UNTRACKED COLUMN ${t}.${c} — exists in the database, not in the snapshot`);
    }
  }

  return drift;
}

module.exports = { fetchLiveSchema, diffSchemas };
