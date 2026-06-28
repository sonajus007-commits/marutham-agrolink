// One-time migration: add gender column to users table
// Run with: node backend/migrate_gender.js
require('dotenv').config({ path: __dirname + '/../.env' });
const supabase = require('./db/supabase');

async function run() {
  const { error } = await supabase.rpc('exec_sql', {
    sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20);"
  });
  if (error) {
    // rpc may not be available — use raw query approach
    const { error: e2 } = await supabase
      .from('users')
      .select('gender')
      .limit(1);
    if (e2 && e2.message && e2.message.includes('column')) {
      console.error('Column does not exist and could not be added automatically.');
      console.error('Run this SQL in your Supabase SQL editor:');
      console.error('  ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20);');
    } else {
      console.log('gender column already exists or was added successfully.');
    }
  } else {
    console.log('Migration complete: gender column added to users table.');
  }
}

run().catch(console.error);
