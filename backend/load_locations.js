// Bulk-load South-India State → District → Taluk into the `locations` table.
// Run once (after applying migration_locations.sql):  node backend/load_locations.js
require('dotenv').config({ path: __dirname + '/.env' });
const fs = require('fs');
const supabase = require('./db/supabase');

async function run() {
  const rows = JSON.parse(fs.readFileSync(__dirname + '/seed_locations.json', 'utf8'));
  console.log(`Loading ${rows.length} State/District/Taluk rows…`);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('locations')
      .upsert(chunk, { onConflict: 'state,district,taluk', ignoreDuplicates: true });
    if (error) {
      console.error('Insert error at batch', i, '-', error.message);
      console.error('Make sure migration_locations.sql has been run in Supabase.');
      process.exit(1);
    }
    inserted += chunk.length;
    process.stdout.write(`  ${inserted}/${rows.length}\r`);
  }

  const { count } = await supabase.from('locations').select('id', { count: 'exact', head: true });
  console.log(`\nDone. locations table now has ${count} rows.`);
}
run().catch(e => { console.error(e); process.exit(1); });
