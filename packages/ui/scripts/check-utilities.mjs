/**
 * Fails if a Tailwind class used in packages/ui never made it into the build.
 *
 *   pnpm build && node packages/ui/scripts/check-utilities.mjs
 *
 * Tailwind does not error on a class it cannot resolve — it emits nothing and
 * moves on. `duration-base` looks exactly like `duration-200` in the source and
 * silently produces no CSS, because `--duration-*` is not a theme namespace.
 * That is invisible in a passing build, a passing typecheck and a passing test
 * suite, and shows up only as a component that does not animate.
 *
 * Only tokens containing `-`, `:` or `[` are checked. A bare `flex` or
 * `uppercase` is indistinguishable from an English word in a string literal, so
 * it is skipped; those are also the utilities that never break.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const UI = resolve(ROOT, 'packages/ui/src');
const DIST = resolve(ROOT, 'apps/web/dist/assets');

let css;
try {
  const files = readdirSync(DIST).filter((f) => f.endsWith('.css'));
  if (!files.length) throw new Error('no css');
  css = files.map((f) => readFileSync(resolve(DIST, f), 'utf8')).join('\n');
} catch {
  console.error('No built CSS in apps/web/dist/assets. Run `pnpm build` first.');
  process.exit(1);
}

/* Tailwind escapes `[`, `]`, `(`, `)`, `.`, `,`, `:`, `/`, `%`, `#` in selectors.
 * Stripping every backslash lets us match the class exactly as it was written. */
const flat = css.replace(/\\/g, '');

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const f = resolve(dir, e);
    if (statSync(f).isDirectory()) yield* walk(f);
    else if (['.ts', '.tsx'].includes(extname(f))) yield f;
  }
}

/** A string literal that could plausibly be a class list. Class lists never
 * contain uppercase letters, semicolons, braces or template holes — but code
 * captured by a stray apostrophe does. */
const isClassList = (s) =>
  s.trim().length > 0 && !/[A-Z;{}$`]/.test(s) && !/^\.{0,2}\//.test(s);

/** A token worth checking: lowercase-initial, with a dash, variant colon or
 * arbitrary-value bracket. `var(--white)` is a CSS value, not a utility; a
 * bare `dashed` or `polite` has nothing to resolve. */
const isClassLike = (t) =>
  /^[a-z]/.test(t) &&
  /[-:[]/.test(t) &&
  !t.startsWith('var(') &&
  // Quoted attribute names: 'aria-invalid', 'data-testid'. A real variant such
  // as `data-[state=open]:flex` carries a bracket or colon, so it survives.
  !/^(aria|data)-[a-z-]+$/.test(t);

/** Present as a selector: `.token` followed by `{`, `:`, `,`, `>`, ` ` or `)`. */
const emitted = (t) => {
  let i = -1;
  while ((i = flat.indexOf('.' + t, i + 1)) !== -1) {
    const next = flat[i + 1 + t.length];
    if (next === undefined || '{:,> )~+'.includes(next)) return true;
  }
  return false;
};

const missing = [];
let checked = 0;

for (const file of walk(UI)) {
  const src = readFileSync(file, 'utf8')
    // Comments first: an apostrophe in prose ("the caller's classes") otherwise
    // opens a string literal that runs on until the next quote, swallowing code.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    // Import specifiers are dash-bearing strings that are not utilities.
    .replace(/^\s*(import|export)\b.*$/gm, '');

  for (const m of src.matchAll(/(['"])([^'"\n]*)\1/g)) {
    const literal = m[2];
    if (!isClassList(literal)) continue;
    for (const tok of literal.split(/\s+/)) {
      if (!tok || !isClassLike(tok)) continue;
      checked++;
      if (!emitted(tok)) missing.push({ tok, file: relative(ROOT, file) });
    }
  }
}

if (missing.length) {
  console.error(`${missing.length} class(es) used in packages/ui produced no CSS:\n`);
  for (const { tok, file } of missing) console.error(`  ${tok.padEnd(46)} ${file}`);
  console.error('\nUsually a theme key that does not exist. Check the @theme block.');
  process.exit(1);
}

console.log(`all ${checked} Tailwind classes in packages/ui resolved to CSS`);
