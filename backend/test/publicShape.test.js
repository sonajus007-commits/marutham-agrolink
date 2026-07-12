const test = require('node:test');
const assert = require('node:assert/strict');
const { publicFarmer, IDENTIFYING_FIELDS } = require('../utils/publicShape');

// The joined users row as GET /products/:id selects it.
const FARMER = {
  id: 'a3f1e0c2-1111-2222-3333-444455556666',
  fname: 'Selvi',
  lname: 'Murugan',
  village_town: 'Aranthangi',
  district: 'Pudukkottai',
};

test('publicFarmer hides the grower from a stranger', async (t) => {
  await t.test('anonymous callers get the district and nothing else', () => {
    assert.deepEqual(publicFarmer(FARMER, null), { district: 'Pudukkottai' });
    assert.deepEqual(publicFarmer(FARMER, undefined), { district: 'Pudukkottai' });
  });

  await t.test('no identifying field survives — this is the whole point', () => {
    const shaped = publicFarmer(FARMER, null);
    for (const field of IDENTIFYING_FIELDS) {
      assert.equal(shaped[field], undefined, `${field} leaked to an anonymous caller`);
    }
    // Belt and braces: the name must not appear anywhere in the payload.
    const json = JSON.stringify(shaped);
    assert.equal(json.includes('Selvi'), false);
    assert.equal(json.includes('Murugan'), false);
    assert.equal(json.includes('Aranthangi'), false);
  });

  await t.test('a column added to the query later cannot silently start leaking', () => {
    // Allow-list, not delete-list: an unforeseen field is dropped by default.
    const withNewColumn = { ...FARMER, aadhar: '123456789012', phone: '9876543210' };
    assert.deepEqual(publicFarmer(withNewColumn, null), { district: 'Pudukkottai' });
  });

  await t.test('a grower with no district still shapes cleanly', () => {
    assert.deepEqual(publicFarmer({ fname: 'Ravi' }, null), { district: null });
  });

  await t.test('null in, null out', () => {
    assert.equal(publicFarmer(null, null), null);
    assert.equal(publicFarmer(undefined, { id: 'u1' }), null);
  });
});

test('publicFarmer leaves a signed-in customer’s view untouched', async (t) => {
  await t.test('the buyer sees who they are buying from', () => {
    const viewer = { id: 'consumer-1', role: 'consumer' };
    assert.deepEqual(publicFarmer(FARMER, viewer), FARMER);
  });

  await t.test('any authenticated role counts — the gate is anonymity, not privilege', () => {
    for (const role of ['consumer', 'farmer', 'admin']) {
      assert.equal(publicFarmer(FARMER, { id: 'u', role }).fname, 'Selvi');
    }
  });
});
