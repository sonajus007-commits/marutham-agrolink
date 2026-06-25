// Usage: node test_return.js <consumerToken> <orderId>
// Run AFTER advancing the order to "Delivered" in Supabase.

require('dotenv').config();
const http = require('http');

const [,, consumerToken, orderId] = process.argv;
if (!consumerToken || !orderId) {
  console.error('Usage: node test_return.js <consumerToken> <orderId>');
  process.exit(1);
}

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

async function run() {
  // Fetch the order first to see its code
  const ord = await request('GET', `/orders/${orderId}`, null, consumerToken);
  if (ord.status !== 200) {
    console.error('Could not fetch order:', ord.body);
    process.exit(1);
  }
  const orderCode = ord.body.order.code;
  console.log(`\nParent order code : ${orderCode}`);

  // Request a full return
  const ret = await request('POST', `/orders/${orderId}/return`, {
    full_return: true,
    lines: [],
    photos: [],
  }, consumerToken);

  console.log(`\nReturn response (${ret.status}):`);
  console.log(JSON.stringify(ret.body, null, 2));

  if (ret.status === 201) {
    const returnCode = ret.body.code;
    console.log('\n' + '═'.repeat(60));
    console.log('  RESULT');
    console.log('═'.repeat(60));
    console.log(`  Order  code : ${orderCode}`);
    console.log(`  Return code : ${returnCode}`);

    // Verify inherited district + date
    const orderDC   = orderCode.slice(3, 6);
    const orderDate = orderCode.slice(6, 12);
    const retDC     = returnCode.slice(3, 6);
    const retDate   = returnCode.slice(6, 12);

    if (orderDC === retDC && orderDate === retDate) {
      console.log(`  PASS: district (${retDC}) and date (${retDate}) correctly inherited from order.`);
    } else {
      console.log(`  FAIL: mismatch — order has ${orderDC}/${orderDate}, return has ${retDC}/${retDate}`);
    }
    console.log('═'.repeat(60));
  }
}

run().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
