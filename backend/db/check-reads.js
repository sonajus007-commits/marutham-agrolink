#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Unchecked-result guard.
//
//   node backend/db/check-reads.js        (pure static analysis — NO database)
//
// supabase-js NEVER THROWS. It resolves to `{ data, error }`. A query that fails
// — a dropped column, a broken embed, an RLS change, a network blip — returns
// `data: null` alongside an `error` object, and if nobody reads `error` the route
// carries on with nothing and answers as though nothing were wrong.
//
// This is the single most expensive bug class in this codebase's history:
//
//   • GET /products/:id embedded a relationship that does not exist. It served
//     `listings: []` to every caller for months.
//   • GET /dashboard selected a column that does not exist. "Top Products" was
//     empty on every dashboard, ever.
//   • POST /auth/register discarded the error from its duplicate-phone guard. A
//     transient failure let a SECOND account onto a phone that already had one —
//     and login matches on `phone`, so `.maybeSingle()` then raised PGRST116 for
//     BOTH accounts and answered "invalid phone number or password" forever. One
//     swallowed error, two users permanently locked out, blamed on their password.
//
// check-embeds.js catches the first two by asking the database. It cannot catch
// the third, cannot run in CI (there is no database there), and neither can a
// unit test. But the DEFECT is visible in the source: the error is not read. So
// read the source.
//
// TWO FAILURE SHAPES, and the second is worse:
//
//   const { data } = await supabase.from('t')...         ← error dropped: reads
//   await supabase.from('t').insert(row);                ← result dropped: WRITES
//
// The second is a write whose failure is completely invisible. The route returns
// 201, the row is not there, and nothing anywhere records that it didn't land.
//
// ESCAPE HATCH. Some calls genuinely do not care — a best-effort audit log that
// must not fail the request it is logging. Say so, on the line before:
//
//   // reads-ok: best-effort; a failed audit write must not fail the login
//   await supabase.from('login_history').insert(row);
//
// The reason is required. "reads-ok" with no reason does not silence anything —
// the point is to make the decision deliberate and legible, not to make it easy.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'test', '.git']);

/**
 * Blank out comments, keeping every newline so line numbers still line up. Code
 * inside a comment is not code — without this, an example in a header (or a
 * commented-out query) is reported as a live defect, and this very file would
 * fail its own check.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/[^\n]/g, ' '));
}

/** Every `await supabase…` in the file, with how its result is handled. */
function findCalls(src) {
  const calls = [];
  // Either destructured — `const { a, b } = await supabase` — or not, in which
  // case the result is discarded outright.
  const re = /(?:(?:const|let|var)\s*\{([^}]*)\}\s*=\s*)?await\s+supabase\b/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const destructured = m[1];
    const line = src.slice(0, m.index).split('\n').length;
    calls.push({
      line,
      // A leading `{…} =` means it was destructured; undefined means it was not.
      checked: destructured !== undefined && /\berror\b/.test(destructured),
      discarded: destructured === undefined,
    });
  }
  return calls;
}

/** `// reads-ok: <reason>` on the preceding line, with a reason that isn't blank. */
function waived(lines, lineNo) {
  for (let i = lineNo - 2; i >= 0 && i >= lineNo - 4; i--) {
    const text = (lines[i] || '').trim();
    if (text === '' || text.startsWith('//')) {
      const m = /^\/\/\s*reads-ok:\s*(.+)$/.exec(text);
      if (m && m[1].trim().length > 3) return true;
      if (text !== '' && !text.startsWith('//')) return false;
      continue;
    }
    return false;
  }
  return false;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    // This file talks ABOUT the pattern, in prose and in string literals. A
    // linter does not lint itself.
    else if (entry.name.endsWith('.js') && full !== __filename) files.push(full);
  }
  return files;
}

const offenders = [];
let total = 0;
let waivedCount = 0;

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('await supabase')) continue;
  // Calls are found in the comment-stripped source; waivers are read from the
  // original, because a waiver IS a comment.
  const lines = src.split('\n');

  for (const call of findCalls(stripComments(src))) {
    total++;
    if (call.checked) continue;
    if (waived(lines, call.line)) { waivedCount++; continue; }
    offenders.push({
      file: path.relative(ROOT, file),
      line: call.line,
      kind: call.discarded ? 'RESULT DISCARDED' : 'error not read',
    });
  }
}

if (offenders.length) {
  console.error('Supabase calls whose failure would be invisible:\n');
  const discarded = offenders.filter((o) => o.kind === 'RESULT DISCARDED');
  const unread = offenders.filter((o) => o.kind !== 'RESULT DISCARDED');

  if (discarded.length) {
    console.error(`  RESULT DISCARDED — usually a write; it fails and the route still answers OK (${discarded.length}):`);
    discarded.forEach((o) => console.error(`    ✘ ${o.file}:${o.line}`));
    console.error('');
  }
  if (unread.length) {
    console.error(`  ERROR NOT READ — the query fails and the route continues with nothing (${unread.length}):`);
    unread.forEach((o) => console.error(`    ✘ ${o.file}:${o.line}`));
    console.error('');
  }

  console.error(`${total} supabase calls · ${offenders.length} would fail silently.`);
  console.error('\nRead the error and act on it, or — if the failure is genuinely not worth');
  console.error('acting on — say why on the line above:\n');
  console.error('  // reads-ok: best-effort; a failed audit write must not fail the login\n');
  process.exit(1);
}

console.log(`✓ ${total} supabase calls — every one reads its error` +
            (waivedCount ? ` (${waivedCount} deliberately waived).` : '.'));
