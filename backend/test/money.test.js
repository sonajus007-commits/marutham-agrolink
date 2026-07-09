const test = require('node:test');
const assert = require('node:assert/strict');
const { convertMoney } = require('../utils/money');

test('converts paise integers to rupee strings', async (t) => {
  await t.test('a plain money field', () => {
    assert.equal(convertMoney({ total: 11820 }).total, '118.20');
  });
  await t.test('keeps sub-rupee precision', () => {
    assert.equal(convertMoney({ price: 4215 }).price, '42.15');
  });
  await t.test('null and undefined pass through untouched', () => {
    assert.equal(convertMoney({ total: null }).total, null);
    assert.equal(convertMoney({ total: undefined }).total, undefined);
  });
  await t.test('recurses into nested objects and arrays', () => {
    const out = convertMoney({ order: { total: 100 }, items: [{ price: 250 }] });
    assert.equal(out.order.total, '1.00');
    assert.equal(out.items[0].price, '2.50');
  });
  await t.test('leaves non-money fields alone', () => {
    assert.equal(convertMoney({ qty: 5500, platform_fee_pct: 5 }).qty, 5500);
    assert.equal(convertMoney({ platform_fee_pct: 5 }).platform_fee_pct, 5);
  });
});

// Regression: `amount` was converted while its siblings were not, so the
// subscription gate rendered "₹200" struck through beside a "₹2" price and its
// button read "Pay ₹2 & Activate" for a ₹300 charge.
test('GET /subscription/plans — every money field in one response shares a unit', async (t) => {
  const plansResponse = convertMoney({
    plans: [{ name: 'Monthly', days: 30, base_amount: 20000, amount: 20000 }],
    concession_pct: 0,
    registration_charge: 10000,
    registration_charge_applies: true,
  });
  const plan = plansResponse.plans[0];

  await t.test('the plan price is rupees, not paise', () => {
    assert.equal(plan.amount, '200.00');
  });
  await t.test('base_amount is converted too, not left in paise', () => {
    assert.equal(plan.base_amount, '200.00');
  });
  await t.test('registration_charge is converted too', () => {
    assert.equal(plansResponse.registration_charge, '100.00');
  });
  await t.test('an un-discounted plan compares equal, so no bogus strikethrough', () => {
    // The legacy page rendered a strikethrough whenever base_amount !== amount.
    // With 20000 vs "200.00" that was always true.
    assert.equal(plan.base_amount === plan.amount, true);
  });
  await t.test('the total adds up as numbers, not string concatenation', () => {
    const total = Number(plan.amount) + Number(plansResponse.registration_charge);
    assert.equal(total, 300);
  });
  await t.test('non-money siblings keep their type', () => {
    assert.equal(plan.days, 30);
    assert.equal(plansResponse.concession_pct, 0);
    assert.equal(plansResponse.registration_charge_applies, true);
  });
});

// Regression: /subscription/pay divided by 100 by hand. Once the field names
// joined MONEY_FIELDS that would have converted twice — ₹100 becoming ₹1.00.
test('POST /subscription/pay — the handler must hand over paise, never pre-divide', async (t) => {
  const planFee = 20000;
  const regCharge = 10000;

  await t.test('paise in, rupee strings out', () => {
    const out = convertMoney({
      plan_amount: planFee,
      registration_charge: regCharge,
      amount_paid: planFee + regCharge,
    });
    assert.equal(out.plan_amount, '200.00');
    assert.equal(out.registration_charge, '100.00');
    assert.equal(out.amount_paid, '300.00');
  });

  await t.test('pre-dividing would report a hundredth of the charge', () => {
    const wrong = convertMoney({ registration_charge: regCharge / 100 });
    assert.equal(wrong.registration_charge, '1.00'); // ₹100 charge, ₹1.00 shown
  });
});

test('users + subscription_payments money columns are converted', async (t) => {
  await t.test('the user record returned by /auth/me', () => {
    const out = convertMoney({ user: { subscription_amount: 20000, registration_charge: 10000 } });
    assert.equal(out.user.subscription_amount, '200.00');
    assert.equal(out.user.registration_charge, '100.00');
  });
  await t.test('a subscription_payments row', () => {
    const out = convertMoney({ plan_amount: 55000, registration_charge: 0, total_amount: 55000 });
    assert.deepEqual(out, { plan_amount: '550.00', registration_charge: '0.00', total_amount: '550.00' });
  });
});
