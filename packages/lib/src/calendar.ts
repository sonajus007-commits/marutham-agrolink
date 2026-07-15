/* Calendar grid + date math for the <DatePicker> in @marutham/ui.
 *
 * Pure and DOM-free, so it is testable without a renderer and portable to a
 * React Native calendar later — the same split as table.ts / <Table>.
 *
 * A date here is a `CivilDate`: a { year, month, day } triple with no time and
 * no zone. A picker selects a *calendar day*, and a JS `Date` cannot hold one
 * without also holding a moment in a timezone. `new Date('2026-07-10')` parses
 * as UTC midnight, which is the previous day in any timezone west of Greenwich —
 * the classic "date picker returns yesterday" bug. We never let a bare `Date`
 * carry the selection; it appears only inside `weekdayOf`, boxed in UTC where it
 * is safe. Months are 1-based (Jan = 1); JS `Date`'s 0-based months are a
 * frequent off-by-one and stay out of the interface. */

export interface CivilDate {
  year: number;
  /** 1-based: January is 1, December is 12. */
  month: number;
  day: number;
}

/** A month to render, without a day. */
export interface YearMonth {
  year: number;
  month: number;
}

export interface DayCell {
  date: CivilDate;
  /** False for the leading/trailing days that belong to the adjacent month. */
  inCurrentMonth: boolean;
}

/** 0 = Sunday … 6 = Saturday. India's calendars start the week on Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DisabledSpec {
  /** Inclusive earliest selectable day. */
  min?: CivilDate | null;
  /** Inclusive latest selectable day. */
  max?: CivilDate | null;
  /** Arbitrary per-day predicate — e.g. block weekends or booked slots. */
  isDisabled?: (date: CivilDate) => boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-07-10". The wire format for a selection — sortable and zone-free. */
export function toISO(d: CivilDate): string {
  return d.year + '-' + pad(d.month) + '-' + pad(d.day);
}

/** Parse "YYYY-MM-DD"; returns null for anything else or an impossible day. */
export function fromISO(s: string | null | undefined): CivilDate | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const date: CivilDate = { year: +m[1]!, month: +m[2]!, day: +m[3]! };
  // Reject 2026-02-30 and month 00/13 rather than silently rolling them over.
  if (date.month < 1 || date.month > 12) return null;
  if (date.day < 1 || date.day > daysInMonth(date.year, date.month)) return null;
  return date;
}

/** Days in a month, 1-based month. Handles February in leap years. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one; Date's month is 0-based.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Weekday of a civil date, computed in UTC so no local zone can shift it. */
export function weekdayOf(d: CivilDate): Weekday {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() as Weekday;
}

/** <0 if a is earlier, 0 if the same day, >0 if a is later. */
export function compareDates(a: CivilDate, b: CivilDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function isSameDate(a: CivilDate | null, b: CivilDate | null): boolean {
  return !!a && !!b && compareDates(a, b) === 0;
}

/** Shift a month view by whole months, rolling the year over. */
export function addMonths(view: YearMonth, delta: number): YearMonth {
  // Work in a 0-based month index so the arithmetic and rollover are one step.
  const zero = view.year * 12 + (view.month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (((zero % 12) + 12) % 12) + 1 };
}

export function isDisabled(date: CivilDate, spec: DisabledSpec = {}): boolean {
  if (spec.min && compareDates(date, spec.min) < 0) return true;
  if (spec.max && compareDates(date, spec.max) > 0) return true;
  return spec.isDisabled ? spec.isDisabled(date) : false;
}

/**
 * True when every day of `view` is out of range, so the arrow that would move
 * to it should be disabled. Checks the boundary day the arrow travels toward:
 * the last day of an earlier month, the first day of a later one.
 */
export function isMonthReachable(view: YearMonth, spec: DisabledSpec): boolean {
  if (spec.min) {
    const lastDay = daysInMonth(view.year, view.month);
    if (compareDates({ ...view, day: lastDay }, spec.min) < 0) return false;
  }
  if (spec.max) {
    if (compareDates({ ...view, day: 1 }, spec.max) > 0) return false;
  }
  return true;
}

/**
 * The 6×7 grid for a month. Always six rows, so the calendar keeps one height
 * as the user pages through months rather than reflowing between 4- and 6-week
 * views. Leading and trailing cells carry the real adjacent-month dates (marked
 * `inCurrentMonth: false`) so a click on them still resolves to a valid day.
 */
export function monthGrid(view: YearMonth, weekStartsOn: Weekday = 0): DayCell[][] {
  const firstWeekday = weekdayOf({ ...view, day: 1 });
  // How many trailing days of the previous month lead the grid.
  const lead = (firstWeekday - weekStartsOn + 7) % 7;

  const start = addDays({ ...view, day: 1 }, -lead);

  const weeks: DayCell[][] = [];
  let cursor = start;
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      row.push({
        date: cursor,
        inCurrentMonth: cursor.month === view.month && cursor.year === view.year,
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(row);
  }
  return weeks;
}

/** Add days to a civil date, crossing month and year boundaries. UTC-boxed. */
export function addDays(d: CivilDate, delta: number): CivilDate {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + delta));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/** The seven weekday indices in display order for a given week start. */
export function weekdayOrder(weekStartsOn: Weekday = 0): Weekday[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as Weekday);
}
