const https = require('https');
const supabase = require('../db/supabase');

// In-memory state — persists until server restart
let _lastSync = null;

const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070'; // data.gov.in APMC daily prices

function fetchGovPrices(state) {
  const apiKey = process.env.DATA_GOV_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') {
    return Promise.reject(new Error('DATA_GOV_API_KEY not configured in .env — get a free key at https://data.gov.in/user/register'));
  }

  const qs = new URLSearchParams({
    'api-key': apiKey,
    format:    'json',
    limit:     '5000',
    'filters[State]': state || 'Tamil Nadu',
  });
  const url = `https://api.data.gov.in/resource/${RESOURCE_ID}?${qs}`;

  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          resolve(json.records || []);
        } catch(e) {
          reject(new Error('Invalid API response: ' + e.message));
        }
      });
    }).on('error', reject).on('timeout', function() { this.destroy(new Error('API request timed out')); });
  });
}

// Match commodity name from API to product name in our catalogue
function nameMatches(commodity, product) {
  const c = commodity.toLowerCase().trim();
  const names = [product.name, product.regional_name].filter(Boolean).map(n => n.toLowerCase().trim());
  return names.some(n => c === n || c.includes(n) || n.includes(c));
}

async function syncPrices() {
  const ran_at = new Date().toISOString();
  const state  = process.env.PRICE_SYNC_STATE || 'Tamil Nadu';
  let updated  = 0;
  let errors   = [];

  try {
    console.log(`[PRICE SYNC] Fetching government prices for ${state}…`);

    const { data: products, error: productsErr } = await supabase
      .from('products')
      .select('id, name, regional_name, code')
      .eq('available', true);

    // Unread, a failed read was reported as status 'ok' with "No active products in
    // catalogue" — a broken sync describing itself as a healthy no-op.
    if (productsErr) {
      console.error('[PRICE SYNC] Could not read the product catalogue:', productsErr.message);
      _lastSync = { ran_at, updated: 0, errors: [productsErr.message], status: 'error', message: 'Could not read the product catalogue' };
      return _lastSync;
    }

    if (!products || products.length === 0) {
      _lastSync = { ran_at, updated: 0, errors: [], status: 'ok', message: 'No active products in catalogue' };
      return _lastSync;
    }

    const records = await fetchGovPrices(state);
    if (!records.length) {
      _lastSync = { ran_at, updated: 0, errors: [], status: 'ok', message: 'API returned 0 price records' };
      return _lastSync;
    }

    // Group records by district+commodity → keep modal price
    const priceMap = {}; // `district_lc:commodity_lc` → { district, modal }
    for (const r of records) {
      const district  = (r['District']    || r['district']    || '').trim();
      const commodity = (r['Commodity']   || r['commodity']   || '').trim();
      const modal     = parseInt(r['Modal_Price'] || r['modal_price'] || '0', 10);
      if (!district || !commodity || modal <= 0) continue;
      const key = district.toLowerCase() + ':' + commodity.toLowerCase();
      if (!priceMap[key] || modal > priceMap[key].modal) {
        priceMap[key] = { district, commodity, modal };
      }
    }

    // Build upsert rows by matching commodities to our products
    const rows = [];
    const updatedProductIds = new Set();

    for (const { district, commodity, modal } of Object.values(priceMap)) {
      const matched = products.find(p => nameMatches(commodity, p));
      if (!matched) continue;
      rows.push({
        product_id:   matched.id,
        district:     district,
        market_price: modal * 100, // rupees → paise
        handling:     0,
      });
      updatedProductIds.add(matched.id);
    }

    if (rows.length === 0) {
      _lastSync = {
        ran_at, updated: 0, errors: [],
        status: 'ok',
        message: `Fetched ${records.length} API records — no commodity names matched our catalogue`,
      };
      return _lastSync;
    }

    const { error: dbErr } = await supabase
      .from('product_district_prices')
      .upsert(rows, { onConflict: 'product_id,district' });

    if (dbErr) {
      errors.push('DB error: ' + dbErr.message);
    } else {
      updated = rows.length;
      // Stamp price_date on updated products
      const today = new Date().toISOString().slice(0, 10);
      const { error: stampErr } = await supabase.from('products')
        .update({ price_date: today, updated_at: new Date().toISOString() })
        .in('id', [...updatedProductIds]);
      if (stampErr) console.error('[PRICE SYNC] Prices updated but price_date could not be stamped:', stampErr.message);
    }

    _lastSync = {
      ran_at,
      updated,
      errors,
      status: errors.length ? 'partial' : 'ok',
      message: `Synced ${updated} district price(s) from ${records.length} API records (${updatedProductIds.size} product(s) matched)`,
    };
    console.log(`[PRICE SYNC] Done — ${updated} price row(s) updated.`);
  } catch(e) {
    errors.push(e.message);
    _lastSync = { ran_at, updated: 0, errors, status: 'error', message: e.message };
    console.error('[PRICE SYNC] Error:', e.message);
  }

  return _lastSync;
}

function getLastSync() {
  return _lastSync;
}

module.exports = { syncPrices, getLastSync };
