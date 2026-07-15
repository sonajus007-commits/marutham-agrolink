import { describe, it, expect } from 'vitest';
import {
  isOrderCancelled,
  isOrderActive,
  canCancelOrder,
  canRequestReturn,
  returnWindowHoursLeft,
  groupConsumerOrders,
  deriveOrderCharges,
  itemLineTotal,
  CANCELLABLE_STATUSES,
  RETURN_WINDOW_HOURS,
  type Order,
} from './orders';

const order = (o: Partial<Order>): Order => ({ id: 'o1', status: 'Order Placed', ...o }) as Order;
const HOUR = 3600e3;

describe('isOrderCancelled', () => {
  // GET /orders (list) omits the `cancelled` column; cancel writes status='Cancelled'.
  // Checking only one of the two misclassifies orders on whichever endpoint lacks it.
  it('detects the `cancelled` flag from the detail endpoint', () => {
    expect(isOrderCancelled(order({ cancelled: true, status: 'Packaged' }))).toBe(true);
  });

  it('detects status="Cancelled" from the list endpoint, which has no `cancelled`', () => {
    expect(isOrderCancelled(order({ status: 'Cancelled' }))).toBe(true);
  });

  it('leaves live orders alone', () => {
    expect(isOrderCancelled(order({ status: 'Packaged' }))).toBe(false);
  });
});

describe('isOrderActive', () => {
  it('a cancelled order is never active, even without the `cancelled` flag', () => {
    // Regression: `!o.cancelled && status !== 'Delivered'` put this in "Active Orders".
    expect(isOrderActive(order({ status: 'Cancelled' }))).toBe(false);
  });

  it('delivered is not active', () => {
    expect(isOrderActive(order({ status: 'Delivered' }))).toBe(false);
  });

  it('in-flight is active', () => {
    expect(isOrderActive(order({ status: 'Out for Delivery' }))).toBe(true);
  });
});

describe('canCancelOrder', () => {
  it.each(CANCELLABLE_STATUSES)('allows cancelling at "%s"', (status) => {
    expect(canCancelOrder(order({ status }))).toBe(true);
  });

  it.each(['VCO Verified', 'Picked Up', 'In Transit', 'At Hub', 'Out for Delivery', 'Delivered'])(
    'refuses once the order has moved to "%s"',
    (status) => {
      expect(canCancelOrder(order({ status }))).toBe(false);
    },
  );

  it('refuses to cancel an already-cancelled order', () => {
    expect(canCancelOrder(order({ status: 'Cancelled' }))).toBe(false);
    expect(canCancelOrder(order({ status: 'Packaged', cancelled: true }))).toBe(false);
  });
});

describe('canRequestReturn', () => {
  const now = Date.parse('2026-07-09T12:00:00Z');
  const delivered = (hoursAgo: number, extra: Partial<Order> = {}) =>
    order({
      status: 'Delivered',
      delivered_at: new Date(now - hoursAgo * HOUR).toISOString(),
      ...extra,
    });

  it('allows a return inside the window', () => {
    expect(canRequestReturn(delivered(2), now)).toBe(true);
  });

  it('refuses once the window has closed', () => {
    expect(canRequestReturn(delivered(RETURN_WINDOW_HOURS + 1), now)).toBe(false);
  });

  it('refuses a second return', () => {
    expect(canRequestReturn(delivered(2, { return_id: 'r1' }), now)).toBe(false);
  });

  it('refuses an undelivered order', () => {
    expect(canRequestReturn(order({ status: 'Packaged' }), now)).toBe(false);
  });

  it('refuses a cancelled order', () => {
    expect(canRequestReturn(delivered(2, { cancelled: true }), now)).toBe(false);
  });

  it('refuses a list-shaped order, which carries no delivered_at', () => {
    expect(canRequestReturn(order({ status: 'Delivered' }), now)).toBe(false);
  });

  it('reports the hours remaining', () => {
    expect(returnWindowHoursLeft(delivered(4), now)).toBeCloseTo(20);
    expect(returnWindowHoursLeft(delivered(99), now)).toBe(0);
  });
});

describe('groupConsumerOrders', () => {
  const orders = [
    order({ id: 'a', status: 'Order Placed' }),
    order({ id: 'b', status: 'Delivered' }),
    order({ id: 'c', status: 'Cancelled' }),
    order({ id: 'd', status: 'Packaged', cancelled: true }),
  ];
  const g = groupConsumerOrders(orders);

  it('counts only in-flight orders as active', () => {
    expect(g.active.map((o) => o.id)).toEqual(['a']);
  });

  it('puts delivered and cancelled orders in the past', () => {
    expect(g.past.map((o) => o.id)).toEqual(['b', 'c', 'd']);
  });

  it('every order lands in exactly one of active | past', () => {
    orders.forEach((o) => {
      expect(Number(g.active.includes(o)) + Number(g.past.includes(o))).toBe(1);
    });
  });
});

describe('deriveOrderCharges', () => {
  // Postgres numerics arrive as strings.
  const o = order({
    item_total: '88.20',
    handling: '0.00',
    delivery: '30.00',
    total: '118.20',
    saved: '16.80',
  });

  it('splits a persisted order back into its charge lines', () => {
    expect(deriveOrderCharges(o)).toEqual({
      itemTotal: 88.2,
      handling: 0,
      marketFee: 0,
      delivery: 30,
      total: 118.2,
      saved: 16.8,
    });
  });

  it('recovers the flat multi-farmer fee as the residual', () => {
    const multi = order({ item_total: '100', handling: '0', delivery: '25', total: '135' });
    expect(deriveOrderCharges(multi).marketFee).toBe(10);
  });

  it('floors float noise so a fee-free order shows no market fee', () => {
    const noisy = order({
      item_total: '88.20',
      handling: '0',
      delivery: '30',
      total: '118.2000001',
    });
    expect(deriveOrderCharges(noisy).marketFee).toBe(0);
  });

  it('ignores the market_fee column, which is platform margin, not a customer charge', () => {
    // Real row: market_fee = 4.20 while the consumer-facing fee is 0.
    const withColumn = order({
      item_total: '88.20',
      handling: '0',
      delivery: '30',
      total: '118.20',
      market_fee: '4.20',
    });
    expect(deriveOrderCharges(withColumn).marketFee).toBe(0);
  });

  it('charge lines add up to the total', () => {
    const c = deriveOrderCharges(
      order({ item_total: '100', handling: '5', delivery: '25', total: '140' }),
    );
    expect(c.itemTotal + c.handling + c.marketFee + c.delivery).toBeCloseTo(c.total);
  });

  it('treats missing money fields as zero', () => {
    expect(deriveOrderCharges(order({}))).toEqual({
      itemTotal: 0,
      handling: 0,
      marketFee: 0,
      delivery: 0,
      total: 0,
      saved: 0,
    });
  });
});

describe('itemLineTotal', () => {
  it('coerces the numeric-as-string price', () => {
    expect(itemLineTotal({ name: 'Brinjal', qty: 3, price: '29.40' })).toBeCloseTo(88.2);
  });

  it('handles a numeric price', () => {
    expect(itemLineTotal({ name: 'x', qty: 2, price: 10 })).toBe(20);
  });

  it('treats a missing price as zero rather than NaN', () => {
    expect(itemLineTotal({ name: 'x', qty: 2 })).toBe(0);
  });
});
