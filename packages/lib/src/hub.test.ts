import { describe, it, expect } from 'vitest';
import {
  groupHubQueue, canCheckInAtHub, canDispatchFromHub, isHubStaff,
  HUB_STAFF_ROLES,
} from './hub';
import type { Order } from './orders';

const order = (o: Partial<Order>): Order => ({ id: 'o1', status: 'At Hub', route: 'hub', ...o });

describe('hub queue grouping', () => {
  it('splits the two states the hub actually works', () => {
    const q = groupHubQueue([
      order({ id: 'a', status: 'In Transit' }),
      order({ id: 'b', status: 'At Hub' }),
      order({ id: 'c', status: 'In Transit' }),
    ]);
    expect(q.arriving.map((o) => o.id)).toEqual(['a', 'c']);
    expect(q.ready.map((o) => o.id)).toEqual(['b']);
  });

  it('ignores stages the hub has no business with', () => {
    const q = groupHubQueue([
      order({ status: 'Packaged' }),
      order({ status: 'Picked Up' }),
      order({ status: 'Out for Delivery' }),
      order({ status: 'Delivered' }),
    ]);
    expect(q.arriving).toEqual([]);
    expect(q.ready).toEqual([]);
  });

  it('never queues a direct-routed order — it does not pass through a hub', () => {
    const q = groupHubQueue([
      order({ id: 'direct', route: 'direct', status: 'In Transit' }),
      order({ id: 'nul', route: null, status: 'At Hub' }),
    ]);
    expect(q.arriving).toEqual([]);
    expect(q.ready).toEqual([]);
  });

  it('drops a CANCELLED order even though the list endpoint omits the column', () => {
    // The trap: GET /orders does not return `cancelled`, so the legacy
    // `!o.cancelled` test passed for a cancelled order. Status is the tell.
    const q = groupHubQueue([
      order({ id: 'x', status: 'Cancelled' }),
      order({ id: 'y', status: 'At Hub', cancelled: true }),
      order({ id: 'z', status: 'In Transit', cancelled: false }),
    ]);
    expect(q.ready).toEqual([]);
    expect(q.arriving.map((o) => o.id)).toEqual(['z']);
  });
});

describe('canCheckInAtHub / canDispatchFromHub — mirror the /scan stage rules', () => {
  it('checks in only an In Transit hub order', () => {
    expect(canCheckInAtHub(order({ status: 'In Transit' }))).toBe(true);
    expect(canCheckInAtHub(order({ status: 'At Hub' }))).toBe(false);
    expect(canCheckInAtHub(order({ status: 'In Transit', route: 'direct' }))).toBe(false);
  });

  it('dispatches only an At Hub order (stage 5, hub route — the server insists)', () => {
    expect(canDispatchFromHub(order({ status: 'At Hub' }))).toBe(true);
    expect(canDispatchFromHub(order({ status: 'In Transit' }))).toBe(false);
    expect(canDispatchFromHub(order({ status: 'At Hub', route: 'direct' }))).toBe(false);
    expect(canDispatchFromHub(order({ status: 'At Hub', cancelled: true }))).toBe(false);
  });
});

describe('isHubStaff — mirrors the backend isHubStaff check', () => {
  it('admits the hub incharge and the senior admins above them', () => {
    for (const role of HUB_STAFF_ROLES) expect(isHubStaff(role)).toBe(true);
  });

  it('refuses the field roles — a Delivery Agent does not dispatch from the hub', () => {
    expect(isHubStaff('Delivery Agent')).toBe(false);
    expect(isHubStaff('VCO')).toBe(false);
    expect(isHubStaff('Board of Director')).toBe(false);
    expect(isHubStaff(null)).toBe(false);
    expect(isHubStaff(undefined)).toBe(false);
  });
});
