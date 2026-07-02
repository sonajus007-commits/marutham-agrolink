// One-time migration: add delivery_address jsonb column to orders table
// Run with: node backend/migrate_order_address.js
require('dotenv').config({ path: __dirname + '/.env' });
const supabase = require('./db/supabase');

const SQL = "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address jsonb;";

async function run() {
  const { error } = await supabase.rpc('exec_sql', { sql: SQL });
  if (error) {
    console.error('Could not apply migration automatically via exec_sql RPC.');
    console.error('Reason:', error.message);
    console.error('\nRun this SQL in your Supabase SQL editor:');
    console.error('  ' + SQL);
    process.exit(1);
  }
  console.log('Migration complete: delivery_address column added to orders table.');
}

run().catch(console.error);
