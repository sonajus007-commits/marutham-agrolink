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

/** Every `.from('t').select('…')` whose select contains an embed. */
function collectEmbeds(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') collectEmbeds(full, found);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;

    const src = fs.readFileSync(full, 'utf8');
    const re = /\.from\(\s*'(\w+)'\s*\)\s*\.select\(\s*([`'"])([\s\S]*?)\2/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const [table, , select] = [m[1], m[2], m[3]];
      if (!/\w+\s*\(/.test(select)) continue; // no embed → nothing to resolve
      found.push({
        file: path.relative(ROOT, full),
        line: src.slice(0, m.index).split('\n').length,
        table,
        select: select.replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return found;
}

(async () => {
  const embeds = collectEmbeds(ROOT);
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
  if (broken.length) {
    console.error(`\n${checked} embedded selects checked · ${broken.length} BROKEN.`);
    console.error('Each one is serving an empty result to every caller right now.\n');
    process.exit(1);
  }
  console.log(`✓ ${checked} embedded selects — every relationship resolves.`);
})();
