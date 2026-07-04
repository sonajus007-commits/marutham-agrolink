// One-time migration: employee org-structure fields + audit trail.
// Run with: node backend/migrate_employee_org.js
require('dotenv').config({ path: __dirname + '/.env' });
const fs = require('fs');
const path = require('path');
const supabase = require('./db/supabase');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'migration_employee_org.sql'), 'utf8');

async function run() {
  const { error } = await supabase.rpc('exec_sql', { sql: SQL });
  if (error) {
    console.error('Could not apply migration automatically via exec_sql RPC.');
    console.error('Reason:', error.message);
    console.error('\n>>> Please open the Supabase SQL editor and run the contents of');
    console.error('    migration_employee_org.sql   <<<\n');
    process.exit(1);
  }
  console.log('Migration complete: employee org-structure fields + audit trail applied.');
}

run().catch((e) => { console.error(e); process.exit(1); });
