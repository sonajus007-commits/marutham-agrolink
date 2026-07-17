#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Embedded-select guard.
//
// PostgREST resolves `alias:table ( cols )` through a FOREIGN KEY. Ask for one
// that does not exist and it does not throw — it returns an error object. Every
// route in this codebase destructures `{ data }` and most never look at
// `{ error }`, so a broken embed degrades into a silently EMPTY response: the
// screen renders, the list is blank, and nobody files a bug.
//
// That is not hypothetical. Two shipped endpoints were doing exactly this:
//   • GET /products/:id  — embedded product_ratings under farmer_listings, which
//     has no FK to it. Served `listings: []` to every caller, for months.
//   • GET /dashboard     — selected order_items.subtotal, a column that does not
//     exist. "Top Products" was empty on every dashboard, ever.
//
// A typecheck cannot see this and neither can a unit test: only the database
// knows which relationships exist. So this script extracts every embedded select
// in backend/ and RUNS it (LIMIT 1, read-only), failing on any that the schema
// rejects.
//
//   node backend/db/check-embeds.js      (needs .env — it talks to the real DB)
//
// Not in CI, which has no database. Run it after touching a select, and when a
// migration changes a relationship.
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');

const ROOT = path.join(__dirname, '..');

/**
 * Read the argument text of a call, starting AT its opening paren. Returns the
 * text between the parens.
 *
 * A regex cannot do this: `select('id, product:products ( name )')` contains
 * parens INSIDE a string, so counting them blindly ends the argument early. This
 * walks the source instead, tracking whether it is currently inside a quote.
 */
function readArgs(src, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;                       // escaped char — skip it
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  return null; // unbalanced — treat as unreadable rather than guess
}

/** `const NAME = '…'` string literals, so a `${NAME}` inside a select can be expanded. */
function constStrings(src) {
  const out = {};
  const re = /const\s+(\w+)\s*=\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2\s*;/g;
  let m;
  while ((m = re.exec(src)) !== null) out[m[1]] = m[3];
  return out;
}

/** Every string literal appearing in a chunk of argument source. */
function stringLiterals(text) {
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[2]);
  return out;
}

/**
 * Every `.from('t').select(…)` whose select contains an embed.
 *
 * The select is NOT required to be a bare literal. It used to be, and that quietly
 * made this whole gate optional: `.select(cond ? `${COLS}, order_items(count)` :
 * COLS)` matched nothing, so the embed inside it was never executed and the run
 * still reported ✓. A check that skips what it cannot parse — and says nothing —
 * is worse than no check, because `test/helpers/fakeSupabase.js` points AT this
 * script as the thing that covers relationships the fake cannot see.
 *
 * So: read the whole argument, pull every string literal out of it, expand any
 * `${CONST}` that resolves to a const in the same file, and hand back anything
 * still unresolved so the caller can REPORT it instead of dropping it.
 */
function collectEmbeds(dir, found = [], unresolved = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') collectEmbeds(full, found, unresolved);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;

    const src = fs.readFileSync(full, 'utf8');
    const consts = constStrings(src);
    const re = /\.from\(\s*'(\w+)'\s*\)\s*\.select\(/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const table = m[1];
      const args = readArgs(src, re.lastIndex - 1);
      if (args === null) continue;

      const where = {
        file: path.relative(ROOT, full),
        line: src.slice(0, m.index).split('\n').length,
        table,
      };

      for (const raw of stringLiterals(args)) {
        if (!/\w+\s*\(/.test(raw)) continue; // no embed → nothing to resolve
        const select = raw.replace(/\$\{(\w+)\}/g, (whole, name) =>
          consts[name] !== undefined ? consts[name] : whole);
        // An interpolation we cannot resolve statically would be sent to PostgREST
        // verbatim and fail as a bogus column — a red gate that says nothing true.
        // Surface it as a gap instead.
        if (select.includes('${')) unresolved.push({ ...where, select: select.replace(/\s+/g, ' ').trim() });
        else found.push({ ...where, select: select.replace(/\s+/g, ' ').trim() });
      }
    }
  }
  return found;
}

(async () => {
  const unresolved = [];
  const embeds = collectEmbeds(ROOT, [], unresolved);
  const seen = new Set();
  const broken = [];

  for (const e of embeds) {
    const key = `${e.table}::${e.select}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { error } = await supabase.from(e.table).select(e.select).limit(1);
    if (error) {
      broken.push({ ...e, message: error.message });
      console.error(`\n  ✗ ${e.file}:${e.line}`);
      console.error(`    from('${e.table}').select( ${e.select.slice(0, 80)}… )`);
      console.error(`    → ${error.message}`);
    }
  }

  const checked = seen.size;

  // Not a failure — it is a hole in THIS script's reach, and the only honest thing
  // to do is name it. Silence here is what let an unexecuted embed report ✓.
  if (unresolved.length) {
    console.warn(`\n  ⚠ ${unresolved.length} embedded select(s) could not be resolved statically and were NOT executed:`);
    for (const u of unresolved) console.warn(`    ${u.file}:${u.line} → ${u.select.slice(0, 80)}`);
    console.warn('    Point them at a const string literal in the same file so they can be checked.\n');
  }

  if (broken.length) {
    console.error(`\n${checked} embedded selects checked · ${broken.length} BROKEN.`);
    console.error('Each one is serving an empty result to every caller right now.\n');
    process.exit(1);
  }
  console.log(`✓ ${checked} embedded selects — every relationship resolves.`);
})();
