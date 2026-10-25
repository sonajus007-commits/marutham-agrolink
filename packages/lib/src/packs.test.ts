import { describe, it, expect } from 'vitest';
import { composeDailyPack, packCartItems, PACK_MAX_FARMERS } from './packs';
import type { Offer, Product } from './consumer';

const P = (id: string, name: string, unit = 'kg'): Product => ({ id, name, unit });
const O = (farmer: string, price: number, extra: Partial<Offer> = {}): Offer => ({
  id: `l-${farmer}-${price}`,
  farmer_price: price,
  consumer_price: price * 100,
  qty_available: 50,
  farmer: { id: farmer, fname: farmer },
  ...extra,
});

// The live catalogue's vegetables today.
const catalogue = [
  P('tom', 'Tomatoes'),
  P('oni', 'Onion'),
  P('chi', 'Green Chilli'),
  P('bri', 'Brinjal'),
  P('car', 'Carrot'),
  P('pot', 'Potato'),
  P('cor', 'Coriander Leaves', 'bunch'),
  P('cur', 'Curry Leaves', 'bunch'),
];
const allFrom = (farmer: string) =>
  Object.fromEntries(catalogue.map((p) => [p.id, [O(farmer, 40)]]));

describe('composeDailyPack', () => {
  it('fills every required slot from the current catalogue', () => {
    const pack = composeDailyPack(catalogue, allFrom('f1'), 3, 1);
    expect(pack.available).toBe(true);
    expect(pack.missing).toEqual([]);
    const bySlot = Object.fromEntries(pack.lines.map((l) => [l.slot, l]));
    expect(bySlot.tomato.product.id).toBe('tom'); // plural "Tomatoes" matches
    expect(bySlot.tomato.qty).toBe(0.3);
    expect(bySlot.onion.qty).toBe(0.25);
    expect(bySlot.chilli.qty).toBe(0.05);
    expect(bySlot.kuzhambu.product.id).toBe('bri');
    expect(bySlot.poriyal.product.id).toBe('car');
    expect(bySlot.coriander.qty).toBe(1);
    expect(pack.skipped).toContain('smallOnion');
    expect(pack.farmerCount).toBe(1);
  });

  it('scales quantities by family size', () => {
    const two = composeDailyPack(catalogue, allFrom('f1'), 2, 1);
    const five = composeDailyPack(catalogue, allFrom('f1'), 5, 1);
    const qty = (p: typeof two, s: string) => p.lines.find((l) => l.slot === s)!.qty;
    expect(qty(two, 'tomato')).toBe(0.2);
    expect(qty(five, 'tomato')).toBe(0.5);
    expect(qty(five, 'kuzhambu')).toBe(0.5);
  });

  it('is not offered when a required slot has no supply', () => {
    const offers = allFrom('f1');
    delete offers.bri;
    const pack = composeDailyPack(catalogue, offers, 3, 1);
    expect(pack.available).toBe(false);
    expect(pack.missing).toEqual(['kuzhambu']);
  });

  it('never fills the big-onion slot with small onion', () => {
    const cat = [P('so', 'Small Onion'), ...catalogue.filter((p) => p.id !== 'oni')];
    const offers = { ...allFrom('f1'), so: [O('f1', 60)] };
    const pack = composeDailyPack(cat, offers, 3, 1);
    expect(pack.missing).toContain('onion');
    expect(pack.lines.find((l) => l.slot === 'smallOnion')?.product.id).toBe('so');
  });

  it('follows the weekday rotation, falling back when the lead veg is absent', () => {
    const cat = [...catalogue, P('dru', 'Drumstick'), P('bea', 'Beans')];
    const offers = { ...allFrom('f1'), dru: [O('f1', 50)], bea: [O('f1', 60)] };
    const mon = composeDailyPack(cat, offers, 3, 1);
    expect(mon.lines.find((l) => l.slot === 'kuzhambu')!.product.id).toBe('dru');
    expect(mon.lines.find((l) => l.slot === 'poriyal')!.product.id).toBe('bea');
    const tue = composeDailyPack(cat, offers, 3, 2);
    expect(tue.lines.find((l) => l.slot === 'kuzhambu')!.product.id).toBe('bri');
  });

  it('uses a product once even when it fits two slots', () => {
    const cat = catalogue.filter((p) => p.id !== 'car');
    const pack = composeDailyPack(cat, allFrom('f1'), 3, 1);
    const ids = pack.lines.map((l) => l.product.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pack.lines.find((l) => l.slot === 'poriyal')!.product.id).toBe('pot');
  });

  it('adds keerai only on alternate days and mint only on Sunday', () => {
    const cat = [...catalogue, P('kee', 'Arai Keerai', 'bunch'), P('min', 'Mint', 'bunch')];
    const offers = { ...allFrom('f1'), kee: [O('f1', 15)], min: [O('f1', 10)] };
    const slots = (d: 0 | 1 | 2) => composeDailyPack(cat, offers, 5, d).lines.map((l) => l.slot);
    expect(slots(1)).not.toContain('keerai');
    expect(slots(2)).toContain('keerai');
    expect(slots(1)).not.toContain('mint');
    expect(slots(0)).toContain('mint');
    expect(composeDailyPack(cat, offers, 5, 2).lines.find((l) => l.slot === 'keerai')!.qty).toBe(2);
  });

  it('applies MOQ/SPQ and skips offers that would balloon the line', () => {
    const offers = allFrom('f1');
    offers.tom = [
      O('f2', 30, { qty_type: 'MOQ', qty_value: 1 }),
      O('f1', 40, { qty_type: 'SPQ', qty_value: 0.25 }),
    ];
    const pack = composeDailyPack(catalogue, offers, 3, 1);
    const tom = pack.lines.find((l) => l.slot === 'tomato')!;
    expect(tom.offer.farmer?.id).toBe('f1'); // 1 kg MOQ > 2× 300 g, skipped
    expect(tom.qty).toBe(0.5); // 300 g rounded up to packs of 250 g
  });

  it('prefers an offer that supplies the pack amount over a minimum-order one', () => {
    const offers = allFrom('f1');
    // f1 is already in the pack (tomato), but its 750 g onion MOQ would nearly
    // double a 5-member 400 g line — the exact-amount offer from f2 wins.
    offers.oni = [O('f1', 40, { qty_type: 'MOQ', qty_value: 0.75 }), O('f2', 40)];
    const pack = composeDailyPack(catalogue, offers, 5, 1);
    const oni = pack.lines.find((l) => l.slot === 'onion')!;
    expect(oni.offer.farmer?.id).toBe('f2');
    expect(oni.qty).toBe(0.4);
  });

  it('skips offers without enough stock', () => {
    const offers = allFrom('f1');
    offers.tom = [O('f1', 40, { qty_available: 0.1 }), O('f2', 45)];
    const pack = composeDailyPack(catalogue, offers, 3, 1);
    expect(pack.lines.find((l) => l.slot === 'tomato')!.offer.farmer?.id).toBe('f2');
  });

  it('prefers a farmer already in the pack, then nearest', () => {
    const offers = allFrom('f1');
    offers.oni = [O('f9', 20, { distance_km: 1 }), O('f1', 40, { distance_km: 8 })];
    offers.tom = [O('f8', 40, { distance_km: 9 }), O('f7', 40, { distance_km: 2 })];
    const pack = composeDailyPack(catalogue, offers, 3, 1);
    expect(pack.lines.find((l) => l.slot === 'tomato')!.offer.farmer?.id).toBe('f7');
    // f7 is now in; onion is offered by f9 (new) and f1 (new) — nearest wins.
    expect(pack.lines.find((l) => l.slot === 'onion')!.offer.farmer?.id).toBe('f9');
  });

  it(`caps the pack at ${PACK_MAX_FARMERS} farmers`, () => {
    // Each product only from its own farmer → the 5th distinct farmer is refused.
    const offers = Object.fromEntries(catalogue.map((p, i) => [p.id, [O(`f${i}`, 40)]]));
    const pack = composeDailyPack(catalogue, offers, 3, 1);
    expect(pack.farmerCount).toBe(PACK_MAX_FARMERS);
    expect(pack.available).toBe(false);
  });

  it('totals the lines and maps them to pinned cart items', () => {
    const pack = composeDailyPack(catalogue, allFrom('f1'), 2, 1);
    expect(pack.total).toBeCloseTo(
      pack.lines.reduce((s, l) => s + l.price * l.qty, 0),
      2,
    );
    const items = packCartItems(pack);
    expect(items).toHaveLength(pack.lines.length);
    expect(items[0]).toMatchObject({
      product_id: 'tom',
      qty: 0.2,
      price: 40,
      farmer_id: 'f1',
      listing_id: 'l-f1-40',
    });
  });
});
