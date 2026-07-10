import { describe, it, expect } from 'vitest';
import {
  unreadCount, markRead, markAllRead, relativeTime, groupByRecency,
  type NotificationItem,
} from './notifications';

const n = (id: string, time: string, read = false): NotificationItem => ({ id, title: id, time, read });

describe('unreadCount', () => {
  it('counts the unread', () => {
    expect(unreadCount([n('a', '2026-07-10'), n('b', '2026-07-10', true), n('c', '2026-07-10')])).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
});

describe('markRead', () => {
  it('marks one and leaves the rest, immutably', () => {
    const items = [n('a', 'x'), n('b', 'x')];
    const next = markRead(items, 'a');
    expect(next[0]!.read).toBe(true);
    expect(next[1]!.read).toBe(false);
    expect(items[0]!.read).toBe(false); // original untouched
  });
  it('returns the same reference for an item already read (no needless churn)', () => {
    const items = [n('a', 'x', true)];
    expect(markRead(items, 'a')[0]).toBe(items[0]);
  });
  it('is a no-op for an unknown id', () => {
    const items = [n('a', 'x')];
    expect(markRead(items, 'zzz')).toEqual(items);
  });
});

describe('markAllRead', () => {
  it('marks every unread item', () => {
    const next = markAllRead([n('a', 'x'), n('b', 'x', true)]);
    expect(next.every((i) => i.read)).toBe(true);
  });
  it('keeps already-read items by reference', () => {
    const items = [n('a', 'x', true)];
    expect(markAllRead(items)[0]).toBe(items[0]);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-07-10T12:00:00Z').getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const S = 1000, M = 60 * S, H = 60 * M, DAY = 24 * H;

  it('says just now under 45s', () => {
    expect(relativeTime(ago(10 * S), now)).toBe('just now');
  });
  it('minutes, singular and plural', () => {
    expect(relativeTime(ago(1 * M), now)).toBe('1 min ago');
    expect(relativeTime(ago(5 * M), now)).toBe('5 mins ago');
  });
  it('hours, singular and plural', () => {
    expect(relativeTime(ago(1 * H), now)).toBe('1 hour ago');
    expect(relativeTime(ago(3 * H), now)).toBe('3 hours ago');
  });
  it('yesterday and days', () => {
    expect(relativeTime(ago(1 * DAY), now)).toBe('Yesterday');
    expect(relativeTime(ago(3 * DAY), now)).toBe('3 days ago');
  });
  it('falls back to an absolute date beyond a week', () => {
    const out = relativeTime(ago(30 * DAY), now);
    expect(out).not.toMatch(/ago|Yesterday/);
    expect(out).toMatch(/2026/);
  });
  it('never says "in N min" for a future stamp', () => {
    expect(relativeTime(new Date(now + 5 * M).toISOString(), now)).toBe('just now');
  });
  it('is empty for an unparseable time', () => {
    expect(relativeTime('not-a-date', now)).toBe('');
  });
});

describe('groupByRecency', () => {
  // Fix "now" at local noon so the buckets are unambiguous regardless of the
  // test machine's zone: offsets stay within the same local day.
  const now = new Date('2026-07-10T12:00:00').getTime();

  it('buckets into Today / Yesterday / Earlier and drops empties', () => {
    const items = [
      n('today1', '2026-07-10T09:00:00'),
      n('today2', '2026-07-10T11:00:00'),
      n('yest', '2026-07-09T20:00:00'),
      n('old', '2026-07-01T08:00:00'),
    ];
    const groups = groupByRecency(items, now);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Earlier']);
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['yest']);
    expect(groups[2]!.items.map((i) => i.id)).toEqual(['old']);
  });

  it('sorts newest-first within a bucket', () => {
    const groups = groupByRecency(
      [n('early', '2026-07-10T08:00:00'), n('late', '2026-07-10T11:00:00')],
      now,
    );
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['late', 'early']);
  });

  it('drops a bucket with no items', () => {
    const groups = groupByRecency([n('old', '2026-06-01T08:00:00')], now);
    expect(groups.map((g) => g.label)).toEqual(['Earlier']);
  });

  it('puts a future item with Today', () => {
    const groups = groupByRecency([n('future', '2026-07-10T23:00:00')], now);
    expect(groups[0]!.label).toBe('Today');
  });

  it('returns nothing for an empty list', () => {
    expect(groupByRecency([], now)).toEqual([]);
  });
});
