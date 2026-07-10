import { describe, it, expect } from 'vitest';
import {
  toISO, fromISO, daysInMonth, weekdayOf, compareDates, isSameDate,
  addMonths, addDays, isDisabled, isMonthReachable, monthGrid, weekdayOrder,
  type CivilDate,
} from './calendar';

const D = (year: number, month: number, day: number): CivilDate => ({ year, month, day });

describe('toISO / fromISO', () => {
  it('pads month and day', () => {
    expect(toISO(D(2026, 7, 5))).toBe('2026-07-05');
    expect(toISO(D(2026, 12, 25))).toBe('2026-12-25');
  });

  it('round-trips', () => {
    expect(fromISO(toISO(D(2026, 2, 28)))).toEqual(D(2026, 2, 28));
  });

  it('rejects malformed strings', () => {
    for (const s of ['', null, undefined, '2026-7-5', '2026/07/05', 'nonsense', '2026-07']) {
      expect(fromISO(s as string)).toBeNull();
    }
  });

  it('rejects impossible days rather than rolling them over', () => {
    expect(fromISO('2026-02-30')).toBeNull(); // Date would roll to Mar 2
    expect(fromISO('2026-13-01')).toBeNull();
    expect(fromISO('2026-00-10')).toBeNull();
    expect(fromISO('2026-04-31')).toBeNull(); // April has 30
  });

  it('accepts Feb 29 in a leap year but not a common year', () => {
    expect(fromISO('2024-02-29')).toEqual(D(2024, 2, 29));
    expect(fromISO('2026-02-29')).toBeNull();
  });
});

describe('daysInMonth', () => {
  it('knows month lengths', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29); // leap
    expect(daysInMonth(2000, 2)).toBe(29); // century leap
    expect(daysInMonth(1900, 2)).toBe(28); // century non-leap
  });
});

describe('weekdayOf', () => {
  it('is zone-independent (0 = Sunday)', () => {
    // 2026-07-10 is a Friday.
    expect(weekdayOf(D(2026, 7, 10))).toBe(5);
    // 2026-01-01 is a Thursday.
    expect(weekdayOf(D(2026, 1, 1))).toBe(4);
  });
});

describe('compareDates / isSameDate', () => {
  it('orders by year then month then day', () => {
    expect(compareDates(D(2026, 7, 10), D(2026, 7, 11))).toBeLessThan(0);
    expect(compareDates(D(2026, 8, 1), D(2026, 7, 31))).toBeGreaterThan(0);
    expect(compareDates(D(2027, 1, 1), D(2026, 12, 31))).toBeGreaterThan(0);
    expect(compareDates(D(2026, 7, 10), D(2026, 7, 10))).toBe(0);
  });

  it('isSameDate is false for nulls', () => {
    expect(isSameDate(null, D(2026, 7, 10))).toBe(false);
    expect(isSameDate(D(2026, 7, 10), null)).toBe(false);
    expect(isSameDate(D(2026, 7, 10), D(2026, 7, 10))).toBe(true);
  });
});

describe('addMonths', () => {
  it('rolls the year forward', () => {
    expect(addMonths({ year: 2026, month: 11 }, 3)).toEqual({ year: 2027, month: 2 });
  });
  it('rolls the year backward', () => {
    expect(addMonths({ year: 2026, month: 2 }, -3)).toEqual({ year: 2025, month: 11 });
  });
  it('is identity at zero', () => {
    expect(addMonths({ year: 2026, month: 7 }, 0)).toEqual({ year: 2026, month: 7 });
  });
  it('handles a full year and December edge', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 6 }, 12)).toEqual({ year: 2027, month: 6 });
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays(D(2026, 7, 31), 1)).toEqual(D(2026, 8, 1));
    expect(addDays(D(2026, 1, 1), -1)).toEqual(D(2025, 12, 31));
    expect(addDays(D(2024, 2, 28), 1)).toEqual(D(2024, 2, 29)); // leap
    expect(addDays(D(2026, 2, 28), 1)).toEqual(D(2026, 3, 1)); // non-leap
  });
});

describe('isDisabled', () => {
  const spec = { min: D(2026, 7, 5), max: D(2026, 7, 20) };
  it('blocks before min and after max, inclusive of the bounds', () => {
    expect(isDisabled(D(2026, 7, 4), spec)).toBe(true);
    expect(isDisabled(D(2026, 7, 5), spec)).toBe(false);
    expect(isDisabled(D(2026, 7, 20), spec)).toBe(false);
    expect(isDisabled(D(2026, 7, 21), spec)).toBe(true);
  });
  it('honours a predicate', () => {
    const noWeekends = { isDisabled: (d: CivilDate) => weekdayOf(d) === 0 || weekdayOf(d) === 6 };
    expect(isDisabled(D(2026, 7, 11), noWeekends)).toBe(true); // Saturday
    expect(isDisabled(D(2026, 7, 10), noWeekends)).toBe(false); // Friday
  });
  it('is permissive with no spec', () => {
    expect(isDisabled(D(2026, 7, 10))).toBe(false);
  });
});

describe('isMonthReachable', () => {
  it('blocks a month entirely before min', () => {
    expect(isMonthReachable({ year: 2026, month: 6 }, { min: D(2026, 7, 1) })).toBe(false);
    // The month containing min is still reachable via its later days.
    expect(isMonthReachable({ year: 2026, month: 7 }, { min: D(2026, 7, 15) })).toBe(true);
  });
  it('blocks a month entirely after max', () => {
    expect(isMonthReachable({ year: 2026, month: 8 }, { max: D(2026, 7, 31) })).toBe(false);
    expect(isMonthReachable({ year: 2026, month: 7 }, { max: D(2026, 7, 1) })).toBe(true);
  });
});

describe('monthGrid', () => {
  it('is always 6 rows of 7', () => {
    const g = monthGrid({ year: 2026, month: 7 });
    expect(g).toHaveLength(6);
    for (const row of g) expect(row).toHaveLength(7);
  });

  it('starts on the configured weekday', () => {
    // July 2026: the 1st is a Wednesday (weekday 3).
    const sun = monthGrid({ year: 2026, month: 7 }, 0);
    expect(weekdayOf(sun[0]![0]!.date)).toBe(0); // first cell is a Sunday
    // Lead-in: Sun Jun 28, Mon 29, Tue 30, then Wed Jul 1.
    expect(sun[0]![0]!.date).toEqual(D(2026, 6, 28));
    expect(sun[0]![3]!.date).toEqual(D(2026, 7, 1));

    const mon = monthGrid({ year: 2026, month: 7 }, 1);
    expect(weekdayOf(mon[0]![0]!.date)).toBe(1); // first cell is a Monday
    expect(mon[0]![0]!.date).toEqual(D(2026, 6, 29));
  });

  it('marks adjacent-month days and covers the whole month', () => {
    const g = monthGrid({ year: 2026, month: 7 });
    const flat = g.flat();
    // Every day 1..31 of July is present and inCurrentMonth.
    for (let day = 1; day <= 31; day++) {
      const cell = flat.find((c) => isSameDate(c.date, D(2026, 7, day)));
      expect(cell?.inCurrentMonth).toBe(true);
    }
    // Leading and trailing cells belong to adjacent months.
    expect(flat[0]!.inCurrentMonth).toBe(false);
    expect(flat[flat.length - 1]!.inCurrentMonth).toBe(false);
  });

  it('is contiguous — each cell one day after the last', () => {
    const flat = monthGrid({ year: 2026, month: 2 }).flat();
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i]!.date).toEqual(addDays(flat[i - 1]!.date, 1));
    }
  });
});

describe('weekdayOrder', () => {
  it('rotates to the week start', () => {
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});
