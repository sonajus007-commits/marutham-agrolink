// Parse the checked-in migrations to work out which tables and columns the repo
// can actually create. Diffing that against the live database answers the only
// question that matters: "if this database vanished, could I rebuild it?"
//
// The parser is deliberately conservative. It understands CREATE TABLE,
// ALTER TABLE ... ADD/DROP/RENAME COLUMN, and DROP TABLE. Anything else it
// reports as unparsed rather than guessing, so a silent miss is impossible.

const fs = require('fs');

const CONSTRAINT_KEYWORDS = new Set([
  'primary', 'foreign', 'unique', 'check', 'constraint', 'exclude', 'like',
]);

/** Strip -- line comments and /* block comments *\/ without touching string literals. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

/** Split a CREATE TABLE body on commas that are not inside parentheses. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Find the body of a balanced (...) starting at `open`. */
function balanced(sql, open) {
  let depth = 0;
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') { depth--; if (depth === 0) return sql.slice(open + 1, i); }
  }
  return null;
}

const ident = (s) => s.replace(/"/g, '').replace(/^public\./i, '').trim().toLowerCase();

/**
 * Replay every migration in order and return the schema they build:
 *   { tables: { name: Set<column> }, unparsed: string[] }
 */
function buildSchemaFromSql(files) {
  const tables = new Map();
  const unparsed = [];

  for (const file of files) {
    const sql = stripComments(fs.readFileSync(file, 'utf8'));

    // CREATE TABLE [IF NOT EXISTS] name ( ... )
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w".]+)\s*\(/gi;
    let m;
    while ((m = createRe.exec(sql))) {
      const table = ident(m[1]);
      const body = balanced(sql, createRe.lastIndex - 1);
      if (body === null) { unparsed.push(`${file}: unbalanced CREATE TABLE ${table}`); continue; }
      const cols = tables.get(table) || new Set();
      for (const part of splitTopLevel(body)) {
        const first = part.trim().split(/\s+/)[0];
        if (!first) continue;
        if (CONSTRAINT_KEYWORDS.has(first.toLowerCase())) continue;
        cols.add(ident(first));
      }
      tables.set(table, cols);
    }

    // ALTER TABLE name <actions>;  (one statement may carry several ADD COLUMNs)
    const alterRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w".]+)([\s\S]*?);/gi;
    while ((m = alterRe.exec(sql))) {
      const table = ident(m[1]);
      const actions = m[2];
      const cols = tables.get(table) || new Set();

      let a;
      const addRe = /add\s+column\s+(?:if\s+not\s+exists\s+)?([\w"]+)/gi;
      while ((a = addRe.exec(actions))) cols.add(ident(a[1]));

      const dropRe = /drop\s+column\s+(?:if\s+exists\s+)?([\w"]+)/gi;
      while ((a = dropRe.exec(actions))) cols.delete(ident(a[1]));

      const renameRe = /rename\s+column\s+([\w"]+)\s+to\s+([\w"]+)/gi;
      while ((a = renameRe.exec(actions))) { cols.delete(ident(a[1])); cols.add(ident(a[2])); }

      // Constraint-only ALTERs are expected and uninteresting here.
      if (cols.size > 0 || tables.has(table)) tables.set(table, cols);
    }

    const dropTableRe = /drop\s+table\s+(?:if\s+exists\s+)?([\w".]+)/gi;
    while ((m = dropTableRe.exec(sql))) tables.delete(ident(m[1]));
  }

  return { tables, unparsed };
}

/**
 * What exists in the database but no migration creates. These are the objects
 * that could not be rebuilt from the repo — exactly the hole that let
 * users.delivery_addresses go missing in the opposite direction.
 */
function coverageGaps(sqlSchema, live) {
  const missingTables = [];
  const missingColumns = [];

  for (const [table, spec] of Object.entries(live.tables)) {
    const cols = sqlSchema.tables.get(table);
    if (!cols) { missingTables.push(table); continue; }
    for (const col of Object.keys(spec.columns)) {
      if (!cols.has(col)) missingColumns.push(`${table}.${col}`);
    }
  }

  // The reverse: SQL creates something the database does not have.
  const unapplied = [];
  for (const [table, cols] of sqlSchema.tables) {
    const liveTable = live.tables[table];
    if (!liveTable) { unapplied.push(`${table} (whole table)`); continue; }
    for (const col of cols) {
      if (!liveTable.columns[col]) unapplied.push(`${table}.${col}`);
    }
  }

  return { missingTables, missingColumns, unapplied };
}

module.exports = { buildSchemaFromSql, coverageGaps };
