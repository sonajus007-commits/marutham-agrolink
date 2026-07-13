import { describe, it, expect } from 'vitest';
import {
  listingActions, listingActionStatus, listingWaitDays, isListingStale,
  LISTING_STALE_DAYS,
} from './listings';

describe('listingActions', () => {
  it('offers approve or reject on a pending request', () => {
    expect(listingActions('pending')).toEqual(['approve', 'reject']);
  });

  it('offers deactivate (not approve) on a live listing — it is already approved', () => {
    expect(listingActions('active')).toEqual(['deactivate', 'reject']);
  });

  it('lets an admin UNDO a rejection — a no is not a tombstone', () => {
    // A seller who fixed the problem should not have to re-request the product.
    expect(listingActions('rejected')).toEqual(['approve']);
  });

  it('treats an unknown or missing status as pending rather than offering nothing', () => {
    expect(listingActions(undefined)).toEqual(['approve', 'reject']);
    expect(listingActions('banana')).toEqual(['approve', 'reject']);
  });
});

describe('listingActionStatus', () => {
  it('maps each action to the status the backend writes', () => {
    expect(listingActionStatus('approve')).toBe('active');
    expect(listingActionStatus('reject')).toBe('rejected');
  });

  it('deactivate writes PENDING, not rejected — it is a recall, not a refusal', () => {
    // Pulling produce off the storefront puts the row back in the review queue.
    // Telling the seller "no" is a different thing, and says so.
    expect(listingActionStatus('deactivate')).toBe('pending');
  });
});

describe('listingWaitDays', () => {
  const now = new Date('2026-07-13T10:00:00Z');

  it('counts whole days a seller has been waiting', () => {
    expect(listingWaitDays('2026-07-01T10:00:00Z', now)).toBe(12);
  });

  it('is 0 for something submitted today, not null', () => {
    expect(listingWaitDays('2026-07-13T02:00:00Z', now)).toBe(0);
  });

  it('never reports a negative wait — a clock skew is not time travel', () => {
    expect(listingWaitDays('2026-07-20T10:00:00Z', now)).toBe(0);
  });

  it('returns null when there is nothing to measure from', () => {
    expect(listingWaitDays(null, now)).toBeNull();
    expect(listingWaitDays('not-a-date', now)).toBeNull();
  });
});

describe('isListingStale', () => {
  const now = new Date('2026-07-13T10:00:00Z');
  const old = '2026-06-01T10:00:00Z'; // 42 days
  const fresh = '2026-07-12T10:00:00Z'; // 1 day

  it('flags a pending request that has aged past the threshold', () => {
    expect(isListingStale(old, 'pending', now)).toBe(true);
    expect(isListingStale(fresh, 'pending', now)).toBe(false);
  });

  it('does NOT flag a decided listing, however old — nobody is waiting on it', () => {
    expect(isListingStale(old, 'active', now)).toBe(false);
    expect(isListingStale(old, 'rejected', now)).toBe(false);
  });

  it('is inclusive at the threshold', () => {
    const exactly = new Date(now.getTime() - LISTING_STALE_DAYS * 86_400_000).toISOString();
    expect(isListingStale(exactly, 'pending', now)).toBe(true);
  });

  it('survives a missing timestamp', () => {
    expect(isListingStale(null, 'pending', now)).toBe(false);
  });
});
