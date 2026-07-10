/**
 * Finds hard-coded colour literals and maps each to its nearest design token.
 *
 *   node --import tsx scripts/audit-literals.mjs            → report
 *   node --import tsx scripts/audit-literals.mjs --check    → exit 1 if any remain
 *
 * Distance is CIE76 ΔE in Lab. The rule of thumb it encodes: ΔE < 1 is invisible
 * to anyone, ΔE < 2.3 is the "just noticeable difference" for adjacent patches,
 * and nobody is comparing adjacent patches across two screens. Anything above
 * that is a real colour change and needs a human to look at it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, extname } from 'node:path';

import { colors, tint, neutral, semantic } from '../src/tokens.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/* Token definitions live in hex by necessity; tests pin hex on purpose. */
const SKIP = [
  'packages/tokens/src/tokens.ts',
  'packages/tokens/src/tokens.css',
  'packages/lib/src/pipeline.test.ts',
];

const SCAN = ['apps/web/src', 'packages/ui/src', 'packages/lib/src'];
const EXTS = new Set(['.css', '.ts', '.tsx']);

/* Alpha colours — rgba()/hsla() — are colour literals too, and the hex scan is
 * blind to them. Three slipped past it that way: the timeline's focus halo, the
 * modal scrim, and the pipeline's active-node glow.
 *
 * They are enforced in packages/ only. apps/web's three page stylesheets still
 * hold 24 of them; those files are rewritten screen-by-screen in Phase 4, and
 * failing CI on them today would just mean disabling this check. When the last
 * page stylesheet goes, delete ALPHA_EXEMPT and the guard covers everything. */
const ALPHA_ENFORCED = ['packages/ui/src', 'packages/lib/src'];
const ALPHA_EXEMPT = ['apps/web/src'];
const ALPHA_RE = /\b(?:rgba?|hsla?)\([^)]*\)/gi;

/* Every token a literal is allowed to collapse into, as `cssVar → hex`.
 * Semantic roles come first so the report prefers `--fg` over `--text`. */
const TOKENS = {
  ...Object.fromEntries(Object.entries(semantic.light).filter(([, v]) => v.startsWith('#'))
    .map(([k, v]) => [`--${k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`, v])),
  ...Object.fromEntries(Object.entries(colors).map(([k, v]) => [`--${k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`, v])),
  ...Object.fromEntries(Object.entries(tint).map(([k, v]) => [`--tint-${k}`, v])),
  ...Object.fromEntries(Object.entries(neutral).map(([k, v]) => [`--neutral-${k}`, v])),
};

const expand = (hex) => {
  let h = hex.replace('#', '').toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6); // ignore alpha for matching
  return h;
};

function lab(hex) {
  const h = expand(hex);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  // sRGB → XYZ (D65)
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const deltaE = (a, b) => {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

function nearest(hex) {
  let best = null;
  for (const [name, value] of Object.entries(TOKENS)) {
    const d = deltaE(hex, value);
    if (!best || d < best.d) best = { name, value, d };
  }
  return best;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTS.has(extname(full))) yield full;
  }
}

const hits = new Map(); // hex → { count, files:Set }
const alpha = new Map(); // rgba(…) → { count, files:Set }

for (const base of SCAN) {
  const alphaEnforced = ALPHA_ENFORCED.includes(base);
  for (const file of walk(resolve(ROOT, base))) {
    const rel = relative(ROOT, file);
    if (SKIP.includes(rel)) continue;
    const src = readFileSync(file, 'utf8');

    for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const key = `#${expand(m[0])}`;
      if (!hits.has(key)) hits.set(key, { count: 0, files: new Set() });
      const h = hits.get(key);
      h.count++;
      h.files.add(rel);
    }

    if (!alphaEnforced) continue;
    for (const m of src.matchAll(ALPHA_RE)) {
      // `color-mix(in srgb, var(--x) 22%, transparent)` is derived from a token,
      // not a literal. Only bare numeric channels count.
      if (!/[\d.]+\s*[, ]/.test(m[0])) continue;
      const key = m[0].replace(/\s+/g, '');
      if (!alpha.has(key)) alpha.set(key, { count: 0, files: new Set() });
      const a = alpha.get(key);
      a.count++;
      a.files.add(rel);
    }
  }
}

if (process.argv.includes('--check')) {
  const total = [...hits.values()].reduce((s, h) => s + h.count, 0);
  const alphaTotal = [...alpha.values()].reduce((s, h) => s + h.count, 0);

  if (total > 0) {
    console.error(`${total} colour literal(s) outside packages/tokens. Use a token.`);
    for (const [hex, h] of [...hits].sort((a, b) => b[1].count - a[1].count).slice(0, 15)) {
      console.error(`  ${hex}  ×${h.count}  ${[...h.files].join(', ')}`);
    }
  }
  if (alphaTotal > 0) {
    console.error(`\n${alphaTotal} alpha colour literal(s) in ${ALPHA_ENFORCED.join(', ')}.`);
    console.error('Add a token, or derive it with color-mix() from one.');
    for (const [c, h] of [...alpha].sort((a, b) => b[1].count - a[1].count)) {
      console.error(`  ${c}  ×${h.count}  ${[...h.files].join(', ')}`);
    }
  }
  if (total > 0 || alphaTotal > 0) process.exit(1);

  console.log(
    `no colour literals outside packages/tokens ` +
      `(alpha colours enforced in ${ALPHA_ENFORCED.join(', ')}; ` +
      `${ALPHA_EXEMPT.join(', ')} exempt until Phase 4)`,
  );
  process.exit(0);
}

const rows = [...hits].map(([hex, h]) => ({ hex, ...h, ...nearest(hex) }))
  .sort((a, b) => a.d - b.d || b.count - a.count);

const total = rows.reduce((s, r) => s + r.count, 0);
let exact = 0, invisible = 0, jnd = 0, visible = 0;

console.log(`\n  ${total} literals · ${rows.length} distinct\n`);
console.log('  ΔE     ×    literal   → token');
console.log('  ─────────────────────────────────────────────────────────');
for (const r of rows) {
  if (r.d === 0) exact += r.count;
  else if (r.d < 1) invisible += r.count;
  else if (r.d < 2.3) jnd += r.count;
  else visible += r.count;
  const flag = r.d === 0 ? ' ' : r.d < 1 ? '.' : r.d < 2.3 ? '~' : '!';
  console.log(`${flag} ${r.d.toFixed(2).padStart(5)} ${String(r.count).padStart(4)}   ${r.hex}  → ${r.name} ${r.value}`);
}

console.log(`
  ${String(exact).padStart(4)}  exact         (ΔE 0)      — safe, mechanical
  ${String(invisible).padStart(4)}  invisible     (ΔE < 1)    — safe
  ${String(jnd).padStart(4)}  just-noticeable (ΔE < 2.3) — safe in isolation
  ${String(visible).padStart(4)}  visible       (ΔE ≥ 2.3)  — needs a decision
`);
