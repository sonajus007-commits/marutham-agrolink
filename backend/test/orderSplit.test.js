// The rules that decide how a multi-vendor order is split, priced, and rolled back
// up. Pure functions, so these run without a database.
//
// The cases below are the ones that cost money or lie to a customer if they are
// wrong: ranking parcels that are on different routes, re-pricing after one seller
// is cancelled, and where the delivery fee sits when that happens.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  groupItemsBySeller,
  sellerTotals,
  childCode,
  isChildCode,
  rollupStatus,
  rollupPayStatus,
  recalcParent,
  MULTI_VENDOR_FEE,
} = require('../utils/orderSplit');

const line = (farmer_id, name, lineTotal, farmerTotal, saved = 0, village = 'Hosur', district = 'Krishnagiri') => ({
  farmer_id,
  farmer_name: name,
  _lineTotal: lineTotal,
  _lineFarmerTotal: farmerTotal,
  _saved: saved,
  _sellerVillage: village,
  _sellerDistrict: district,
});

describe('groupItemsBySeller', () => {
  test('groups by seller and keeps each seller\'s OWN village', () => {
    const groups = groupItemsBySeller([
      line('f1', 'Ravi', 1000, 950, 0, 'Hosur', 'Krishnagiri'),
      line('f2', 'Meena', 2000, 1900, 0, 'Alangudi', 'Pudukkottai'),
      line('f1', 'Ravi', 500, 475, 0, 'Hosur', 'Krishnagiri'),
    ]);

    assert.equal(groups.length, 2);
    // Two lines from one seller travel as ONE parcel.
    assert.equal(groups[0].items.length, 2);
    // The bug this whole feature exists to fix: the second seller's goods used to
    // inherit the FIRST seller's village and vanish from their own VCO's queue.
    assert.equal(groups[0].village, 'Hosur');
    assert.equal(groups[1].village, 'Alangudi');
    assert.equal(groups[1].district, 'Pudukkottai');
  });

  test('a single-seller cart is one group — nothing to split', () => {
    const groups = groupItemsBySeller([line('f1', 'Ravi', 1000, 950), line('f1', 'Ravi', 400, 380)]);
    assert.equal(groups.length, 1);
  });
});

describe('sellerTotals', () => {
  test('sums the seller\'s own lines, and the market fee is the markup', () => {
    const t = sellerTotals([line('f1', 'Ravi', 1000, 950, 120), line('f1', 'Ravi', 500, 475, 30)]);
    assert.equal(t.item_total, 1500);
    assert.equal(t.market_fee, 75); // (1000−950) + (500−475)
    assert.equal(t.saved, 150);
  });
});

describe('child codes', () => {
  test('suffixes the parent code so the parts read as one order', () => {
    assert.equal(childCode('ORDPDK260724000001', 1), 'ORDPDK260724000001-1');
    assert.equal(childCode('ORDPDK260724000001', 2), 'ORDPDK260724000001-2');
  });

  test('a child code is still an ORD code — the scan bar and :id lookup key off that', () => {
    assert.ok(childCode('ORDPDK260724000001', 1).startsWith('ORD'));
    assert.ok(isChildCode('ORDPDK260724000001-2'));
    assert.ok(!isChildCode('ORDPDK260724000001'));
  });
});

describe('rollupStatus', () => {
  const child = (status, over = {}) => ({ status, cancelled: false, ...over });

  test('the order is only as far along as its LEAST advanced parcel', () => {
    const { status } = rollupStatus([child('Out for Delivery'), child('Packaged')]);
    assert.equal(status, 'Packaged');
  });

  test('ranks across DIFFERENT routes by status, never by stage', () => {
    // 'In Transit' is stage 3 on the hub map; 'Picked Up' is stage 3 on direct.
    // Comparing the integers would call these equal. On the real ladder In Transit
    // comes first, so it is what holds the order back.
    const { status } = rollupStatus([
      child('Picked Up', { stage: 3, route: 'direct' }),
      child('In Transit', { stage: 3, route: 'hub' }),
    ]);
    assert.equal(status, 'In Transit');
  });

  test('every parcel delivered is the only way the order reads Delivered', () => {
    assert.equal(rollupStatus([child('Delivered'), child('Delivered')]).status, 'Delivered');
    assert.equal(rollupStatus([child('Delivered'), child('Out for Delivery')]).status, 'Out for Delivery');
  });

  test('a cancelled parcel does not hold the order back for ever', () => {
    const { status } = rollupStatus([
      { status: 'Cancelled', cancelled: true },
      child('Out for Delivery'),
    ]);
    assert.equal(status, 'Out for Delivery');
  });

  test('all parcels cancelled cancels the order', () => {
    const r = rollupStatus([
      { status: 'Cancelled', cancelled: true },
      { status: 'Cancelled', cancelled: true },
    ]);
    assert.equal(r.status, 'Cancelled');
    assert.ok(r.allCancelled);
  });

  test('an unrecognised status holds the order at the start rather than ranking -1', () => {
    // indexOf returns -1 for an unknown status, which would win any minimum and
    // drag the parent below 'Order Placed'.
    const { status, stage } = rollupStatus([child('Delivered'), child('Something Odd')]);
    assert.equal(status, 'Order Placed');
    assert.equal(stage, 0);
  });
});

describe('rollupPayStatus', () => {
  test('COD is only fully paid once EVERY parcel has been handed over', () => {
    assert.equal(rollupPayStatus([
      { pay_status: 'paid', cancelled: false },
      { pay_status: 'pending', cancelled: false },
    ]), 'pending');
  });

  test('all parcels paid pays the order', () => {
    assert.equal(rollupPayStatus([
      { pay_status: 'paid', cancelled: false },
      { pay_status: 'paid', cancelled: false },
    ]), 'paid');
  });

  test('a cancelled parcel is not waited on', () => {
    assert.equal(rollupPayStatus([
      { pay_status: 'paid', cancelled: false },
      { pay_status: 'pending', cancelled: true },
    ]), 'paid');
  });
});

describe('recalcParent', () => {
  const kid = (seq, seller, item_total, over = {}) => ({
    id: `child-${seq}`, split_seq: seq, seller_id: seller,
    item_total, market_fee: 100, saved: 50,
    status: 'Order Placed', cancelled: false, pay_status: 'pending',
    ...over,
  });

  const CHARGES = { handling: 500, delivery: 2500 }; // ₹5 handling, ₹25 delivery

  test('the parent totals its live parts plus the once-only charges', () => {
    const { parent } = recalcParent([kid(1, 'f1', 10000), kid(2, 'f2', 5000)], CHARGES);

    assert.equal(parent.item_total, 15000);
    assert.equal(parent.market_fee, 200);
    // 15000 + 500 handling + 2500 delivery + 1000 multi-vendor fee
    assert.equal(parent.total, 15000 + 500 + 2500 + MULTI_VENDOR_FEE);
  });

  test('the parts add up to exactly the parent — so COD can be collected per parcel', () => {
    const { parent, childTotals } = recalcParent([kid(1, 'f1', 10000), kid(2, 'f2', 5000)], CHARGES);
    const summed = childTotals.reduce((s, c) => s + c.total, 0);
    assert.equal(summed, parent.total);
  });

  test('the once-only charges ride on the first part, not on every part', () => {
    const { childTotals } = recalcParent([kid(1, 'f1', 10000), kid(2, 'f2', 5000)], CHARGES);
    assert.equal(childTotals[0].total, 10000 + 500 + 2500 + MULTI_VENDOR_FEE);
    assert.equal(childTotals[1].total, 5000);
  });

  test('cancelling a seller drops their goods AND the multi-vendor fee', () => {
    const { parent } = recalcParent(
      [kid(1, 'f1', 10000), kid(2, 'f2', 5000, { cancelled: true, status: 'Cancelled' })],
      CHARGES,
    );
    assert.equal(parent.item_total, 10000);
    // One seller left, so the ₹10 that existed only because the cart spanned
    // sellers is gone too.
    assert.equal(parent.total, 10000 + 500 + 2500);
  });

  test('cancelling the FIRST part moves the delivery fee onto a part still coming', () => {
    // Otherwise a customer could cancel whichever parcel happened to carry the
    // delivery fee and stop owing it.
    const { childTotals, parent } = recalcParent(
      [kid(1, 'f1', 10000, { cancelled: true, status: 'Cancelled' }), kid(2, 'f2', 5000)],
      CHARGES,
    );
    assert.equal(childTotals.length, 1);
    assert.equal(childTotals[0].id, 'child-2');
    assert.equal(childTotals[0].total, 5000 + 500 + 2500);
    assert.equal(parent.total, 5000 + 500 + 2500);
  });

  test('a cancellation NEVER increases the bill', () => {
    // The free-delivery threshold is ₹150. A ₹200 basket that loses ₹120 of goods
    // drops under it — re-running the rule would charge a delivery fee the customer
    // was never quoted, so the ORIGINAL charge stands.
    const free = { handling: 0, delivery: 0 };
    const before = recalcParent([kid(1, 'f1', 12000), kid(2, 'f2', 8000)], free).parent;
    const after = recalcParent(
      [kid(1, 'f1', 12000, { cancelled: true, status: 'Cancelled' }), kid(2, 'f2', 8000)],
      free,
    ).parent;

    assert.equal(after.delivery, 0);
    assert.ok(after.total < before.total, 'cancelling a part must reduce the bill');
  });

  test('nothing left to deliver owes no delivery or handling', () => {
    const { parent } = recalcParent(
      [
        kid(1, 'f1', 10000, { cancelled: true, status: 'Cancelled' }),
        kid(2, 'f2', 5000, { cancelled: true, status: 'Cancelled' }),
      ],
      CHARGES,
    );
    assert.equal(parent.total, 0);
    assert.equal(parent.delivery, 0);
    assert.equal(parent.handling, 0);
    assert.ok(parent.cancelled);
    assert.equal(parent.status, 'Cancelled');
  });

  test('parts are re-priced in sequence order however they arrive from the database', () => {
    const { childTotals } = recalcParent([kid(2, 'f2', 5000), kid(1, 'f1', 10000)], CHARGES);
    assert.equal(childTotals[0].id, 'child-1');
    assert.ok(childTotals[0].total > childTotals[1].total);
  });
});
