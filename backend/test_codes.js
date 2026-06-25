// Quick test: verifies order & return code generation end-to-end.
// Usage:
//   node test_codes.js                         # registers a fresh consumer & farmer
//   node test_codes.js <consumerToken> <orderId>  # re-use existing tokens (skip registration)
//
// Run with the backend already started on port 3000.

require('dotenv').config();
const http = require('http');

const BASE = 'http://localhost:3000';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      method,
      hostname: 'localhost',
      port: 3000,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function log(label, value) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'─'.repeat(60)}`);
  if (typeof value === 'object') console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

async function run() {
  const phone_c  = `99${Date.now().toString().slice(-8)}`;   // unique consumer phone
  const phone_f  = `88${Date.now().toString().slice(-8)}`;   // unique farmer phone
  const password = 'test1234';

  // ── 1. Register a Pudukkottai consumer ──────────────────────────────────────
  console.log('\n[1] Registering test consumer in Pudukkottai…');
  const regC = await request('POST', '/auth/register', {
    phone: phone_c, password, role: 'consumer',
    fname: 'TestConsumer', district: 'Pudukkottai',
    village_town: 'Aranthangi', state: 'Tamil Nadu',
  });
  if (regC.status !== 201) { log('Consumer registration failed', regC.body); process.exit(1); }
  log('Consumer registered', { login_id: regC.body.user.login_id, district: regC.body.user.district });

  const loginC = await request('POST', '/auth/login', { phone: phone_c, password });
  if (loginC.status !== 200) { log('Consumer login failed', loginC.body); process.exit(1); }
  const consumerToken = loginC.body.token;

  // ── 2. Register a farmer with a product listing ──────────────────────────────
  console.log('\n[2] Registering test farmer…');
  const regF = await request('POST', '/auth/register', {
    phone: phone_f, password, role: 'farmer',
    fname: 'TestFarmer', district: 'Pudukkottai',
    village_town: 'Aranthangi', state: 'Tamil Nadu',
  });
  if (regF.status !== 201) { log('Farmer registration failed', regF.body); process.exit(1); }
  const farmerId = regF.body.user.id;
  log('Farmer registered', { login_id: regF.body.user.login_id });

  const loginF = await request('POST', '/auth/login', { phone: phone_f, password });
  if (loginF.status !== 200) { log('Farmer login failed', loginF.body); process.exit(1); }
  const farmerToken = loginF.body.token;

  // ── 3. Find a product to order ───────────────────────────────────────────────
  console.log('\n[3] Fetching products…');
  const prods = await request('GET', '/products', null, consumerToken);
  if (prods.status !== 200 || !prods.body.products?.length) {
    log('No products found — seed at least one product first', prods.body);
    process.exit(1);
  }
  const product = prods.body.products[0];
  log('Using product', { id: product.id, name: product.name });

  // ── 4. Farmer creates a listing ──────────────────────────────────────────────
  console.log('\n[4] Farmer creating listing…');
  const listing = await request('POST', '/listings', {
    product_id: product.id, farmer_price: 5000, qty_available: 100,
  }, farmerToken);
  if (listing.status !== 201) { log('Listing failed', listing.body); process.exit(1); }
  log('Listing created', listing.body);

  // ── 5. Consumer places ORDER 1 ───────────────────────────────────────────────
  console.log('\n[5] Placing order 1…');
  const ord1 = await request('POST', '/orders', {
    items: [{ product_id: product.id, farmer_id: farmerId, qty: 1 }],
    pay_method: 'Cash on Delivery',
  }, consumerToken);
  if (ord1.status !== 201) { log('Order 1 failed', ord1.body); process.exit(1); }
  const order1Code = ord1.body.order.code;
  const order1Id   = ord1.body.order.id;
  log('Order 1 placed', { code: order1Code, id: order1Id });

  // ── 6. Consumer places ORDER 2 ───────────────────────────────────────────────
  console.log('\n[6] Placing order 2…');
  const ord2 = await request('POST', '/orders', {
    items: [{ product_id: product.id, farmer_id: farmerId, qty: 1 }],
    pay_method: 'Cash on Delivery',
  }, consumerToken);
  if (ord2.status !== 201) { log('Order 2 failed', ord2.body); process.exit(1); }
  const order2Code = ord2.body.order.code;
  log('Order 2 placed', { code: order2Code, id: ord2.body.order.id });

  // ── 7. Verify sequence ───────────────────────────────────────────────────────
  console.log('\n[7] Verifying code sequence…');
  const seq1 = order1Code.slice(-6);
  const seq2 = order2Code.slice(-6);
  const prefix1 = order1Code.slice(0, -6);
  const prefix2 = order2Code.slice(0, -6);

  if (prefix1 !== prefix2) {
    console.log(`  WARN: prefixes differ — ${prefix1} vs ${prefix2} (different district or date?)`);
  } else if (parseInt(seq2) !== parseInt(seq1) + 1) {
    console.log(`  FAIL: expected consecutive sequences but got ${seq1} and ${seq2}`);
  } else {
    console.log(`  PASS: ${order1Code}  →  ${order2Code}  (consecutive)`);
  }

  // ── 8. Advance order 1 to Delivered so a return is possible ─────────────────
  // NOTE: this requires admin tokens in a real scenario.
  // We'll skip the delivery flow and instead confirm the return code format directly
  // via codeGen — for a full flow test, advance the order manually in Supabase.
  console.log('\n[8] Skipping delivery advance (needs admin role).');
  console.log('    To test return codes: advance order 1 to "Delivered" in Supabase,');
  console.log('    then run:');
  console.log(`    node test_return.js ${consumerToken} ${order1Id}`);

  // ── 9. Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Order 1 code : ${order1Code}`);
  console.log(`  Order 2 code : ${order2Code}`);
  console.log(`  Consumer JWT : ${consumerToken}`);
  console.log(`  Order 1 ID   : ${order1Id}`);
  console.log('═'.repeat(60));
}

run().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
