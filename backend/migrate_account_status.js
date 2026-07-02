// One-time migration: account status (active/suspended/blocked) + history + payments.
// Run with: node backend/migrate_account_status.js
require('dotenv').config({ path: __dirname + '/.env' });
const fs = require('fs');
const path = require('path');
const supabase = require('./db/supabase');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'migration_account_status.sql'), 'utf8');

async function run() {
  const { error } = await supabase.rpc('exec_sql', { sql: SQL });
  if (error) {
    console.error('Could not apply migration automatically via exec_sql RPC.');
    console.error('Reason:', error.message);
    console.error('\n>>> Please run migration_account_status.sql in the Supabase SQL editor. <<<');
    process.exit(1);
  }
  console.log('Migration complete: account status, history, and subscription_payments applied.');
}

run().catch(e => { console.error(e); process.exit(1); });
