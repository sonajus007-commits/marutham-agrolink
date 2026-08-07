/**
 * Seed the hub network from the `locations` tree. Idempotent — run after 038:
 *
 *   node backend/db/seed_hubs.js
 *
 * Topology (see migration 038):
 *   • one MAIN hub per district   (hub_type='main',  taluk NULL)
 *   • one TALUK hub per taluk      (hub_type='taluk', parent_hub_id → the main hub)
 *
 * Inserts only what is missing (diffed against the rows already there), so it
 * never duplicates and never touches an existing hub id — users.hub_id and
 * hubs.parent_hub_id reference them. Re-run any time new locations are added.
 */
require('dotenv').config();
const supabase = require('./supabase');

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) {
    console.error(`FAIL  ${label}: ${error.message}`);
    process.exit(1);
  }
  return data;
}

/** Read every row of a table (paged — locations/hubs run to thousands). */
async function fetchAll(table, columns) {
  const all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const rows = await must(
      `${table} page ${from}`,
      supabase.from(table).select(columns).range(from, from + pageSize - 1),
    );
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

async function insertChunked(label, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    await must(`${label} ${i}`, supabase.from('hubs').insert(rows.slice(i, i + 500)));
  }
}

async function seed() {
  console.log('\nSeeding the hub network from locations');
  console.log('─'.repeat(70));

  const locations = await fetchAll('locations', 'state, district, taluk');

  // Distinct districts and (district, taluk) pairs from the reference data.
  const districts = new Map(); // "state|district" -> { state, district }
  const talukKeys = new Map(); // "state|district|taluk" -> { state, district, taluk }
  for (const r of locations) {
    if (!r.state || !r.district || !r.taluk) continue;
    districts.set(`${r.state}|${r.district}`, { state: r.state, district: r.district });
    talukKeys.set(`${r.state}|${r.district}|${r.taluk}`, {
      state: r.state,
      district: r.district,
      taluk: r.taluk,
    });
  }

  const existing = await fetchAll('hubs', 'id, hub_type, state, district, taluk');
  const haveMain = new Set(
    existing.filter((h) => h.hub_type === 'main').map((h) => `${h.state}|${h.district}`),
  );
  const haveTaluk = new Set(
    existing
      .filter((h) => h.hub_type === 'taluk')
      .map((h) => `${h.state}|${h.district}|${h.taluk}`),
  );

  // 1) Main hub per district (only the missing ones).
  const newMains = [...districts.values()]
    .filter((d) => !haveMain.has(`${d.state}|${d.district}`))
    .map((d) => ({
      hub_type: 'main',
      state: d.state,
      district: d.district,
      taluk: null,
      name: `${d.district} Main Hub`,
    }));
  await insertChunked('insert main hubs', newMains);

  // Re-read main hubs so every taluk hub can resolve its parent id.
  const mains = await must(
    'read main hubs',
    supabase.from('hubs').select('id, state, district').eq('hub_type', 'main'),
  );
  const mainId = new Map(mains.map((h) => [`${h.state}|${h.district}`, h.id]));

  // 2) Taluk hub per taluk (only the missing ones), parented to the district main.
  const newTaluks = [...talukKeys.values()]
    .filter((t) => !haveTaluk.has(`${t.state}|${t.district}|${t.taluk}`))
    .map((t) => ({
      hub_type: 'taluk',
      state: t.state,
      district: t.district,
      taluk: t.taluk,
      name: `${t.taluk} Hub`,
      parent_hub_id: mainId.get(`${t.state}|${t.district}`) || null,
    }));
  await insertChunked('insert taluk hubs', newTaluks);

  // reads-ok: this count feeds a summary log line only; a failure must not fail the seed.
  const { count } = await supabase.from('hubs').select('*', { count: 'exact', head: true });
  console.log(
    `✔ Hubs — +${newMains.length} main, +${newTaluks.length} taluk this run. ` +
      `Network: ${districts.size} districts, ${talukKeys.size} taluks (total rows: ${count}).`,
  );
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
