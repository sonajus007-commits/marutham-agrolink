import { offerConsumerPrice, offerHasPhoto } from './consumer';
import type { CartItem, Offer, Product } from './consumer';
import type { Weekday } from './calendar';

/* Daily family veg pack.
 *
 * A pack is a set of SLOTS by cooking role (base, kuzhambu veg, poriyal veg,
 * keerai, seasoning), not a fixed list of SKUs. Each slot is filled from whatever
 * the local farmers confirmed today, and a slot only ever substitutes within its
 * own role — a missing drumstick becomes brinjal, never coriander.
 *
 * The pack is composed client-side from the same live offers feed the shop reads
 * and lands in the cart as ordinary lines (each with its farmer + listing), so the
 * existing checkout, stock check and parent/child order split place it unchanged.
 * Price is today's offer price; there is no pack discount on the daily pack (the
 * saving is in the weekly basket's free delivery, which is a separate feature).
 *
 * Products are matched by English name, so a vegetable the catalogue team adds
 * later (Drumstick, Beans…) joins its slot without a code change. */

export type PackMembers = 2 | 3 | 5;
export const PACK_MEMBERS: readonly PackMembers[] = [2, 3, 5];

export type PackSlotId =
  | 'tomato'
  | 'onion'
  | 'smallOnion'
  | 'chilli'
  | 'kuzhambu'
  | 'poriyal'
  | 'keerai'
  | 'coriander'
  | 'curryLeaves'
  | 'mint';

interface SlotDef {
  id: PackSlotId;
  /** A pack is offered only when every required slot fills. */
  required: boolean;
  /** 'weight' = grams of a kg/g product; 'count' = bunches/pieces. */
  measure: 'weight' | 'count';
  /** Amount per family size, in grams (weight) or bunches (count). */
  amount: Record<PackMembers, number>;
  /** Candidate names in default preference order (lowercase, matched as words). */
  candidates: string[];
  /** Days the slot is included at all; omitted = every day. */
  days?: Weekday[];
}

// Keerai goes in on alternate days; mint only for the Sunday biryani/kurma.
const KEERAI_DAYS: Weekday[] = [2, 4, 6];

export const PACK_SLOTS: readonly SlotDef[] = [
  {
    id: 'tomato',
    required: true,
    measure: 'weight',
    amount: { 2: 200, 3: 300, 5: 500 },
    candidates: ['tomato'],
  },
  {
    id: 'onion',
    required: true,
    measure: 'weight',
    amount: { 2: 150, 3: 250, 5: 400 },
    candidates: ['onion', 'big onion'],
  },
  {
    id: 'smallOnion',
    required: false,
    measure: 'weight',
    amount: { 2: 100, 3: 100, 5: 150 },
    candidates: ['small onion', 'shallot', 'sambar onion'],
  },
  {
    id: 'chilli',
    required: true,
    measure: 'weight',
    amount: { 2: 25, 3: 50, 5: 75 },
    candidates: ['green chilli', 'chilli'],
  },
  {
    id: 'kuzhambu',
    required: true,
    measure: 'weight',
    amount: { 2: 250, 3: 350, 5: 500 },
    candidates: [
      'drumstick',
      'brinjal',
      'ladies finger',
      'okra',
      'radish',
      'ash gourd',
      'chow chow',
      'snake gourd',
    ],
  },
  {
    id: 'poriyal',
    required: true,
    measure: 'weight',
    amount: { 2: 250, 3: 350, 5: 500 },
    // Potato last: a weekly staple, but a fair poriyal when nothing else is in.
    candidates: [
      'beans',
      'carrot',
      'cabbage',
      'beetroot',
      'raw banana',
      'broad beans',
      'cluster beans',
      'potato',
    ],
  },
  {
    id: 'keerai',
    required: false,
    measure: 'count',
    amount: { 2: 1, 3: 1, 5: 2 },
    candidates: ['keerai', 'spinach', 'amaranth', 'drumstick leaves'],
    days: KEERAI_DAYS,
  },
  {
    id: 'coriander',
    required: false,
    measure: 'count',
    amount: { 2: 1, 3: 1, 5: 1 },
    candidates: ['coriander'],
  },
  {
    id: 'curryLeaves',
    required: false,
    measure: 'count',
    amount: { 2: 1, 3: 1, 5: 1 },
    candidates: ['curry leaves', 'curry leaf'],
  },
  {
    id: 'mint',
    required: false,
    measure: 'count',
    amount: { 2: 1, 3: 1, 5: 1 },
    candidates: ['mint'],
    days: [0],
  },
];

/* The weekday menu: which candidates lead each day, so the week isn't seven days
 * of the same brinjal. Anything not listed falls back to the default order. */
const ROTATION: Record<Weekday, Partial<Record<PackSlotId, string[]>>> = {
  1: { kuzhambu: ['drumstick'], poriyal: ['beans'] }, // sambar + beans poriyal
  2: { kuzhambu: ['brinjal'], poriyal: ['cabbage'] }, // kara kuzhambu
  3: { kuzhambu: ['ash gourd', 'ladies finger', 'okra'], poriyal: ['chow chow'] }, // mor kuzhambu + kootu
  4: { kuzhambu: ['snake gourd'], poriyal: ['carrot', 'beans'] }, // rasam day
  5: { kuzhambu: ['radish'], poriyal: ['beetroot'] }, // sambar
  6: { kuzhambu: ['drumstick'], poriyal: ['raw banana', 'carrot'] }, // avial
  0: { poriyal: ['potato'] }, // biryani / kurma
};

/** Farmers per pack. Each extra farmer is another pickup, so the pack stays small. */
export const PACK_MAX_FARMERS = 4;

/** An offer whose minimum/pack size would push a line past this multiple of the
 *  pack amount is skipped (a 1 kg MOQ is not "25 g of chilli"). */
const MAX_OVERSHOOT = 2;

const WEIGHT_UNITS: Record<string, number> = { kg: 1000, g: 1 };
const COUNT_UNITS = new Set(['bunch', 'piece', 'pcs', 'nos', 'bundle']);

export interface PackLine {
  slot: PackSlotId;
  product: Product;
  offer: Offer;
  /** In the product's own unit (kg for a kg product). */
  qty: number;
  /** Rupees per unit, today's consumer price. */
  price: number;
  lineTotal: number;
}

export interface DailyPack {
  members: PackMembers;
  weekday: Weekday;
  lines: PackLine[];
  /** Required slots nothing could fill — the pack is not offered when non-empty. */
  missing: PackSlotId[];
  /** Optional slots (for today) that had no usable offer. */
  skipped: PackSlotId[];
  farmerCount: number;
  total: number;
  available: boolean;
}

/** Lowercase words, plurals folded ("Tomatoes" ≡ "tomato"), padded for whole-word search. */
const norm = (s?: string) =>
  ` ${(s || '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/(es|s)$/, '') : w))
    .join(' ')} `;

/** Does this product name match the candidate as whole words? "Onion" matches
 *  'onion' but "Small Onion" must not fill the big-onion slot. */
function nameMatches(productName: string, candidate: string, slot: SlotDef): boolean {
  const name = norm(productName);
  if (!name.includes(norm(candidate))) return false;
  const raw = productName.toLowerCase();
  if (slot.id === 'onion' && /\b(small|shallots?|sambar)\b/.test(raw)) return false;
  if (slot.id === 'kuzhambu' && /\bleaf|\bleaves/.test(raw)) return false;
  return true;
}

function unitFits(unit: string | undefined, slot: SlotDef): boolean {
  const u = (unit || '').toLowerCase();
  return slot.measure === 'weight' ? u in WEIGHT_UNITS : COUNT_UNITS.has(u);
}

/** The pack amount for this slot in the product's unit, adjusted to the offer's
 *  MOQ/SPQ rule; null when the offer can't sensibly supply it. */
function qtyForOffer(
  slot: SlotDef,
  members: PackMembers,
  unit: string,
  offer: Offer,
): number | null {
  const base =
    slot.measure === 'weight'
      ? slot.amount[members] / WEIGHT_UNITS[unit.toLowerCase()]
      : slot.amount[members];
  let qty = base;
  const rule = parseFloat(String(offer.qty_value));
  if (offer.qty_type === 'MOQ' && rule > 0) qty = Math.max(qty, rule);
  if (offer.qty_type === 'SPQ' && rule > 0) qty = Math.ceil(qty / rule - 1e-9) * rule;
  qty = Math.round(qty * 1000) / 1000;
  if (qty > base * MAX_OVERSHOOT) return null;
  if (offer.qty_available != null && offer.qty_available < qty) return null;
  return qty;
}

function candidatesFor(slot: SlotDef, weekday: Weekday): string[] {
  const lead = ROTATION[weekday][slot.id] || [];
  return [...lead, ...slot.candidates.filter((c) => !lead.includes(c))];
}

/** Rank usable offers: a farmer already in the pack first (fewer pickups), then
 *  today's photo, then nearest, then cheapest. */
function rankOffers(a: Offer, b: Offer, chosen: Set<string>): number {
  const inA = chosen.has(a.farmer?.id || '') ? 1 : 0;
  const inB = chosen.has(b.farmer?.id || '') ? 1 : 0;
  if (inA !== inB) return inB - inA;
  const ph = (offerHasPhoto(b) ? 1 : 0) - (offerHasPhoto(a) ? 1 : 0);
  if (ph) return ph;
  const da = a.distance_km ?? Infinity;
  const db = b.distance_km ?? Infinity;
  if (da !== db) return da - db;
  return offerConsumerPrice(a) - offerConsumerPrice(b);
}

/**
 * Compose today's pack for a family size from the live catalogue + offers.
 * Pure: the caller passes the district's products and offers (already narrowed
 * to the buyer's radius) and the weekday.
 */
export function composeDailyPack(
  products: Product[],
  offersByProduct: Record<string, Offer[]>,
  members: PackMembers,
  weekday: Weekday,
): DailyPack {
  const lines: PackLine[] = [];
  const missing: PackSlotId[] = [];
  const skipped: PackSlotId[] = [];
  const farmers = new Set<string>();
  const usedProducts = new Set<string>();

  for (const slot of PACK_SLOTS) {
    if (slot.days && !slot.days.includes(weekday)) continue;
    let line: PackLine | null = null;

    for (const cand of candidatesFor(slot, weekday)) {
      const matching = products.filter(
        (p) => !usedProducts.has(p.id) && unitFits(p.unit, slot) && nameMatches(p.name, cand, slot),
      );
      for (const product of matching) {
        const usable = (offersByProduct[product.id] || [])
          .filter((o) => o.farmer?.id && (o.qty_available ?? 1) > 0)
          .filter((o) => farmers.has(o.farmer!.id!) || farmers.size < PACK_MAX_FARMERS)
          .map((o) => ({ o, qty: qtyForOffer(slot, members, product.unit!, o) }))
          .filter((x): x is { o: Offer; qty: number } => x.qty !== null)
          .sort((x, y) => rankOffers(x.o, y.o, farmers));
        if (!usable.length) continue;
        const { o, qty } = usable[0];
        const price = offerConsumerPrice(o);
        line = {
          slot: slot.id,
          product,
          offer: o,
          qty,
          price,
          lineTotal: Math.round(price * qty * 100) / 100,
        };
        break;
      }
      if (line) break;
    }

    if (line) {
      lines.push(line);
      usedProducts.add(line.product.id);
      farmers.add(line.offer.farmer!.id!);
    } else if (slot.required) {
      missing.push(slot.id);
    } else {
      skipped.push(slot.id);
    }
  }

  const total = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  return {
    members,
    weekday,
    lines,
    missing,
    skipped,
    farmerCount: farmers.size,
    total,
    available: missing.length === 0,
  };
}

/** The pack as cart lines — the same shape the product sheet adds, farmer and
 *  listing pinned so checkout doesn't re-pick a seller per line. */
export function packCartItems(pack: DailyPack): CartItem[] {
  return pack.lines.map((l) => {
    const f = l.offer.farmer || {};
    return {
      product_id: l.product.id,
      product_name: l.product.name,
      unit: l.product.unit,
      price: l.price,
      qty: l.qty,
      farmer_id: f.id || null,
      farmer_name: (f.fname || '') + (f.lname ? ' ' + f.lname : ''),
      listing_id: (l.offer.id as string | undefined) || null,
      farmer_price_rs: parseFloat(String(l.offer.farmer_price)),
    };
  });
}
