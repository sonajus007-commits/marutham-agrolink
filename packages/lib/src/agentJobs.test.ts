import { describe, it, expect } from 'vitest';
import { pendingJobsFor, minutesUntil, pickupAssignment, type Order } from './orders';

const NOW = new Date('2026-10-18T05:00:00Z').getTime();
const at = (min: number) => new Date(NOW + min * 60000).toISOString();
const o = (over: Partial<Order>): Order => ({ id: 'o', status: 'VCO Verified', ...over }) as Order;

describe('pendingJobsFor', () => {
  it('lists my pending offers on either leg, soonest first', () => {
    const jobs = pendingJobsFor(
      [
        o({
          id: 'a',
          agent_id: 'me',
          agent_assign_status: 'pending',
          agent_accept_deadline: at(12),
        }),
        o({
          id: 'b',
          collection_agent_id: 'me',
          collection_assign_status: 'pending',
          collection_accept_deadline: at(3),
        }),
        o({ id: 'c', agent_id: 'me', agent_assign_status: 'accepted' }),
        o({ id: 'd', agent_id: 'other', agent_assign_status: 'pending' }),
        o({ id: 'e', agent_id: 'me', agent_assign_status: 'pending', cancelled: true }),
      ],
      'me',
    );
    expect(jobs.map((j) => [j.order.id, j.leg])).toEqual([
      ['b', 'collection'],
      ['a', 'agent'],
    ]);
  });
});

describe('minutesUntil', () => {
  it('rounds up and floors at 0', () => {
    expect(minutesUntil(at(14.2), NOW)).toBe(15);
    expect(minutesUntil(at(-2), NOW)).toBe(0);
    expect(minutesUntil(null, NOW)).toBeNull();
  });
});

describe('pickupAssignment', () => {
  it('reads the collection leg on the hub route', () => {
    const a = pickupAssignment(
      o({
        route: 'hub',
        collection_agent_id: 'x',
        collection_agent_name: 'Ravi',
        collection_assign_status: 'pending',
        collection_accept_deadline: at(5),
        agent_name: 'Hub guy',
      }),
      NOW,
    );
    expect(a).toEqual({ leg: 'collection', name: 'Ravi', state: 'pending', minutesLeft: 5 });
  });
  it('a legacy name with no status reads as accepted; nobody reads as none', () => {
    expect(pickupAssignment(o({ route: 'direct', agent_name: 'Old' }), NOW).state).toBe('accepted');
    expect(pickupAssignment(o({ route: 'direct' }), NOW).state).toBe('none');
  });
});
