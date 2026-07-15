import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  type CivilDate, type YearMonth, type Weekday, type DisabledSpec,
  toISO, fromISO, monthGrid, weekdayOrder, weekdayOf, addDays, addMonths,
  isSameDate, isDisabled, isMonthReachable,
} from '@marutham/lib';
import { cn } from './lib/cn';

/* A single-date picker: a text trigger that opens a calendar in a Radix Popover.
 *
 * The calendar math — the 6×7 grid, boundaries, the leap-year edges — lives in
 * @marutham/lib/calendar, pure and unit-tested, the same split as <Table>. This
 * file is the popover, the grid markup and the keyboard model.
 *
 * The value on the wire is an ISO `YYYY-MM-DD` string, never a `Date`: a Date
 * cannot hold a calendar day without also holding a timezone, and midnight-local
 * round-trips to the previous day west of Greenwich. See calendar.ts.
 *
 * The grid follows the WAI-ARIA date-picker dialog pattern: one `role="grid"`,
 * a single tab stop, arrow keys to move day-by-day (wrapping across weeks and
 * months), PageUp/PageDown to change month, Home/End to reach the week's ends. */

export interface DatePickerProps {
  /** Selected day as "YYYY-MM-DD", or null/'' for none. */
  value?: string | null;
  onChange: (value: string | null) => void;
  /** Inclusive earliest / latest selectable day, as "YYYY-MM-DD". */
  min?: string | null;
  max?: string | null;
  /** Block arbitrary days — weekends, booked slots. */
  isDateDisabled?: (isoDate: string) => boolean;
  /** Shown in the trigger when nothing is selected. */
  placeholder?: string;
  /** 0 = Sunday (India's default), 1 = Monday. */
  weekStartsOn?: Weekday;
  /** BCP-47 tag for month and weekday names. Matches the app's en-IN dates. */
  locale?: string;
  disabled?: boolean;
  /** Names the trigger for a screen reader when there is no visible <label>. */
  'aria-label'?: string;
  className?: string;
}

const todayCivil = (): CivilDate => {
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate() };
};

const TRIGGER =
  'inline-flex w-full cursor-pointer appearance-none items-center justify-between gap-2 ' +
  'rounded-sm border border-border-strong bg-surface px-3 py-[9px] ' +
  'font-sans text-sm text-fg ' +
  'hover:border-primary ' +
  'data-[state=open]:border-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-55 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf';

const NAV_BTN =
  'inline-flex cursor-pointer appearance-none items-center justify-center rounded-xs border-0 ' +
  'bg-transparent p-1.5 text-fg-muted ' +
  'hover:bg-surface-muted hover:text-fg ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-leaf';

/* One rule paints hover and keyboard focus alike: `tabIndex` moves the roving
 * focus and `:focus-visible` follows, so arrow-key traversal is always visible. */
const DAY =
  'flex h-9 w-9 cursor-pointer appearance-none items-center justify-center rounded-sm border-0 ' +
  'bg-transparent font-sans text-sm text-fg tabular-nums ' +
  'hover:bg-surface-muted ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-leaf ' +
  'aria-selected:bg-primary aria-selected:text-primary-on aria-selected:font-bold ' +
  'aria-selected:hover:bg-primary-hover ' +
  'disabled:cursor-not-allowed disabled:text-disabled-fg disabled:hover:bg-transparent';

export function DatePicker({
  value,
  onChange,
  min,
  max,
  isDateDisabled,
  placeholder = 'Select a date',
  weekStartsOn = 0,
  locale = 'en-IN',
  disabled = false,
  'aria-label': ariaLabel,
  className,
}: DatePickerProps) {
  const selected = useMemo(() => fromISO(value), [value]);

  const spec: DisabledSpec = useMemo(
    () => ({
      min: fromISO(min),
      max: fromISO(max),
      isDisabled: isDateDisabled ? (d) => isDateDisabled(toISO(d)) : undefined,
    }),
    [min, max, isDateDisabled],
  );

  const [open, setOpen] = useState(false);
  // The month on screen. Opens on the selection, else today.
  const [view, setView] = useState<YearMonth>(() => {
    const base = selected ?? todayCivil();
    return { year: base.year, month: base.month };
  });
  // The day the roving tabindex sits on. Seeded from the selection or today.
  const [focusDate, setFocusDate] = useState<CivilDate>(() => selected ?? todayCivil());

  const gridRef = useRef<HTMLDivElement>(null);

  /* Every date fed to Intl is built with Date.UTC, so every formatter must read
   * it back in UTC too. Without `timeZone: 'UTC'`, Intl formats in the browser's
   * zone: west of Greenwich, Jul 10 00:00 UTC prints as "09 Jul", the month
   * title slips a day into the previous month, and the weekday header rotates by
   * one. This bug is invisible under a UTC/east-of-UTC test machine and only
   * shows for a user in the Americas. */
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(view.year, view.month - 1, 1)));
  const triggerLabel = selected
    ? new Intl.DateTimeFormat(locale, {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
      }).format(new Date(Date.UTC(selected.year, selected.month - 1, selected.day)))
    : placeholder;

  const weeks = useMemo(() => monthGrid(view, weekStartsOn), [view, weekStartsOn]);
  const order = weekdayOrder(weekStartsOn);
  const dayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    // 2023-01-01 is a Sunday, so day index + 1 is that weekday.
    return order.map((wd) => fmt.format(new Date(Date.UTC(2023, 0, 1 + wd))));
  }, [order, locale]);

  /** Move the roving focus, following into the neighbouring month if needed. */
  const moveFocus = (next: CivilDate) => {
    setFocusDate(next);
    if (next.month !== view.month || next.year !== view.year) {
      setView({ year: next.year, month: next.month });
    }
    // Focus the button after the grid re-renders on the new focusDate.
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
    });
  };

  const changeMonth = (delta: number) => {
    const nextView = addMonths(view, delta);
    setView(nextView);
    // Keep the focused day in the visible month, clamped to its length.
    const clampedDay = Math.min(focusDate.day, new Date(Date.UTC(nextView.year, nextView.month, 0)).getUTCDate());
    setFocusDate({ year: nextView.year, month: nextView.month, day: clampedDay });
  };

  const pick = (date: CivilDate) => {
    if (isDisabled(date, spec)) return;
    onChange(toISO(date));
    setOpen(false);
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const key = e.key;
    // No initializer: every branch below either assigns `next` or returns, so it
    // is always set by the time it is read (the `= null` was dead).
    let next: CivilDate | null;
    if (key === 'ArrowLeft') next = addDays(focusDate, -1);
    else if (key === 'ArrowRight') next = addDays(focusDate, 1);
    else if (key === 'ArrowUp') next = addDays(focusDate, -7);
    else if (key === 'ArrowDown') next = addDays(focusDate, 7);
    else if (key === 'Home') next = addDays(focusDate, -((weekdayOf(focusDate) - weekStartsOn + 7) % 7));
    else if (key === 'End') next = addDays(focusDate, 6 - ((weekdayOf(focusDate) - weekStartsOn + 7) % 7));
    else if (key === 'PageUp') next = shiftMonthKeepingDay(focusDate, -1);
    else if (key === 'PageDown') next = shiftMonthKeepingDay(focusDate, 1);
    else if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      pick(focusDate);
      return;
    } else return;

    e.preventDefault();
    if (next) moveFocus(next);
  };

  return (
    <Popover.Root open={open} onOpenChange={disabled ? undefined : setOpen}>
      <Popover.Trigger
        className={cn(TRIGGER, className)}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        <span className={cn(!selected && 'text-fg-muted')}>{triggerLabel}</span>
        <Calendar size={16} aria-hidden="true" className="shrink-0 text-fg-muted" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-[var(--z-overlay)] rounded-md border border-border-subtle bg-surface-raised p-3 shadow-md"
          // Radix would pull focus to the grid on open; send it to the focused
          // day instead so arrow keys work immediately.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() =>
              gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus(),
            );
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className={NAV_BTN}
              aria-label="Previous month"
              disabled={!isMonthReachable(addMonths(view, -1), spec)}
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            {/* aria-live so a screen reader hears the month change on nav. */}
            <div aria-live="polite" className="text-sm font-bold text-fg">
              {monthLabel}
            </div>
            <button
              type="button"
              className={NAV_BTN}
              aria-label="Next month"
              disabled={!isMonthReachable(addMonths(view, 1), spec)}
              onClick={() => changeMonth(1)}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div
            ref={gridRef}
            role="grid"
            aria-label={monthLabel}
            onKeyDown={onGridKeyDown}
          >
            <div role="row" className="flex">
              {dayNames.map((name, i) => (
                <span
                  key={order[i]}
                  role="columnheader"
                  aria-label={name}
                  className="flex h-8 w-9 items-center justify-center text-2xs font-bold uppercase tracking-wide text-fg-muted"
                >
                  {name}
                </span>
              ))}
            </div>

            {weeks.map((week, w) => (
              <div role="row" key={w} className="flex">
                {week.map((cell) => {
                  const isSel = isSameDate(cell.date, selected);
                  const isFocus = isSameDate(cell.date, focusDate);
                  const off = isDisabled(cell.date, spec);
                  return (
                    <div role="gridcell" key={toISO(cell.date)} aria-selected={isSel}>
                      <button
                        type="button"
                        // Exactly one button is the tab stop: the focused day.
                        tabIndex={isFocus ? 0 : -1}
                        disabled={off}
                        aria-selected={isSel}
                        aria-current={
                          isSameDate(cell.date, todayCivil()) ? 'date' : undefined
                        }
                        className={cn(DAY, !cell.inCurrentMonth && !isSel && 'text-fg-muted')}
                        onClick={() => pick(cell.date)}
                        onFocus={() => setFocusDate(cell.date)}
                      >
                        {cell.date.day}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** PageUp/PageDown: same day-of-month one month away, clamped to its length. */
function shiftMonthKeepingDay(date: CivilDate, delta: number): CivilDate {
  const ym = addMonths({ year: date.year, month: date.month }, delta);
  const len = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  return { year: ym.year, month: ym.month, day: Math.min(date.day, len) };
}
