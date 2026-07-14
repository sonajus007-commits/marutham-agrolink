// One command to make a freshly-migrated database USABLE: reference data, then a
// login for every role. Run AFTER `npm run db:migrate` (this adds rows, it does not
// create tables). Every step is idempotent — each underlying seeder skips rows that
// already exist — so running it against a populated database is safe and does nothing.
//
// Order matters: locations and products are reference data other rows point at, so they
// go first; the role logins go last. A failing step aborts the rest rather than seeding
// half a database and reporting success.
//
// This exists so the deploy guide can say "npm run db:seed" instead of listing three
// scripts in the right order and hoping.

const { execFileSync } = require('child_process');
const path = require('path');

const steps = [
  ['Locations (states / districts / taluks)', 'load_locations.js'],
  ['Products (catalogue)',                    'seed_products.js'],
  ['Role logins (one account per role)',      'seed_roles.js'],
];

const backend = path.join(__dirname, '..');

for (const [label, script] of steps) {
  console.log(`\n▶ ${label}  (${script})`);
  try {
    execFileSync(process.execPath, [path.join(backend, script)], { stdio: 'inherit', cwd: backend });
  } catch (e) {
    console.error(`\n✗ Seed step failed: ${script}. Nothing after it has run.`);
    process.exit(1);
  }
}

console.log('\n✔ Seed complete. Every role has a login — see docs/TEST_ACCOUNTS.md.');
