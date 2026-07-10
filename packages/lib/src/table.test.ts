import { describe, it, expect } from 'vitest';
import {
  nextSort, compareCells, sortRows, filterRows,
  pageCount, clampPage, pageSlice,
  selectionState, toggleAll, toggleOne,
  toCsv, type Accessors,
} from './table';

interface Row {
  id: string;
  name: string;
  qty: number | null;
  paid: boolean;
  amount: string; // Postgres numeric arrives as a string
}

const row = (id: string, name: string, qty: number | null, paid: boolean, amount: string): Row =>
  ({ id, name, qty, paid, amount });

const accessors: Accessors<Row> = {
  name: (r) => r.name,
  qty: (r) => r.qty,
  paid: (r) => r.paid,
  amount: (r) => r.amount,
};

const names = (rows: readonly Row[]) => rows.map((r) => r.name);

describe('nextSort — the three-state cycle', () => {
  it('starts an unsorted column ascending', () => {
    expect(nextSort(null, 'qty')).toEqual({ key: 'qty', dir: 'asc' });
  });

  it('turns ascending into descending', () => {
    expect(nextSort({ key: 'qty', dir: 'asc' }, 'qty')).toEqual({ key: 'qty', dir: 'desc' });
  });

  it('clears the sort after descending', () => {
    expect(nextSort({ key: 'qty', dir: 'desc' }, 'qty')).toBeNull();
  });

  it('starts a different column ascending, whatever the old direction was', () => {
    expect(nextSort({ key: 'qty', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
  });
});

describe('compareCells', () => {
  it('compares numbers numerically, not as text', () => {
    expect(compareCells(9, 10)).toBeLessThan(0);
  });

  it('orders false before true', () => {
    expect(compareCells(false, true)).toBeLessThan(0);
    expect(compareCells(true, true)).toBe(0);
  });

  it('collates digits inside strings numerically', () => {
    expect(compareCells('Item 9', 'Item 10')).toBeLessThan(0);
  });

  it('orders numeric strings by magnitude — the shape Postgres numeric arrives in', () => {
    expect(compareCells('900', '1200.50')).toBeLessThan(0);
  });

  it('compares a number against a numeric string by magnitude', () => {
    expect(compareCells(900, '1200.50')).toBeLessThan(0);
  });
});

describe('sortRows', () => {
  const rows = [
    row('a', 'Kavitha', 3, true, '900'),
    row('b', 'Arun', 10, false, '1200.50'),
    row('c', 'Bala', null, true, '75'),
    row('d', 'arun', 9, false, '80'),
  ];

  it('returns the same reference when there is no sort', () => {
    expect(sortRows(rows, null, accessors)).toBe(rows);
  });

  it('returns the same reference when the column has no accessor', () => {
    expect(sortRows(rows, { key: 'nope', dir: 'asc' }, accessors)).toBe(rows);
  });

  it('does not mutate the input', () => {
    sortRows(rows, { key: 'name', dir: 'asc' }, accessors);
    expect(names(rows)).toEqual(['Kavitha', 'Arun', 'Bala', 'arun']);
  });

  it('sorts ascending', () => {
    expect(names(sortRows(rows, { key: 'qty', dir: 'asc' }, accessors)))
      .toEqual(['Kavitha', 'arun', 'Arun', 'Bala']);
  });

  it('sorts descending', () => {
    expect(names(sortRows(rows, { key: 'qty', dir: 'desc' }, accessors)))
      .toEqual(['Arun', 'arun', 'Kavitha', 'Bala']);
  });

  it('keeps empty cells last in BOTH directions', () => {
    const asc = sortRows(rows, { key: 'qty', dir: 'asc' }, accessors);
    const desc = sortRows(rows, { key: 'qty', dir: 'desc' }, accessors);
    expect(asc[asc.length - 1]!.name).toBe('Bala');
    expect(desc[desc.length - 1]!.name).toBe('Bala');
  });

  it('is stable — ties keep their arrival order', () => {
    const tied = [row('a', 'first', 1, true, '0'), row('b', 'second', 1, true, '0')];
    expect(names(sortRows(tied, { key: 'qty', dir: 'desc' }, accessors))).toEqual(['first', 'second']);
  });

  it('sorts a numeric-string column by magnitude, not lexically', () => {
    expect(names(sortRows(rows, { key: 'amount', dir: 'asc' }, accessors)))
      .toEqual(['Bala', 'arun', 'Kavitha', 'Arun']);
  });
});

describe('filterRows', () => {
  const rows = [
    row('a', 'Kavitha', 3, true, '900'),
    row('b', 'Arun', 10, false, '1200.50'),
  ];

  it('returns the same reference for an empty query', () => {
    expect(filterRows(rows, '   ', accessors)).toBe(rows);
  });

  it('matches case-insensitively on any column', () => {
    expect(names(filterRows(rows, 'kavi', accessors))).toEqual(['Kavitha']);
    expect(names(filterRows(rows, '1200', accessors))).toEqual(['Arun']);
  });

  it('requires every term to match, across different columns', () => {
    expect(names(filterRows(rows, 'arun 1200', accessors))).toEqual(['Arun']);
    expect(filterRows(rows, 'arun 900', accessors)).toEqual([]);
  });

  it('treats an empty cell as the empty string rather than throwing', () => {
    const withNull = [row('c', 'Bala', null, true, '75')];
    expect(names(filterRows(withNull, 'bala', accessors))).toEqual(['Bala']);
  });
});

describe('pagination', () => {
  it('counts pages, rounding up', () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
  });

  it('treats pageSize 0 as a single unpaginated page', () => {
    expect(pageCount(500, 0)).toBe(1);
    expect(pageSlice([1, 2, 3], 2, 0)).toEqual([1, 2, 3]);
  });

  it('clamps a page past the end back onto the last page', () => {
    expect(clampPage(7, 11, 10)).toBe(2);
  });

  it('clamps a page below one, and a NaN, up to the first page', () => {
    expect(clampPage(0, 11, 10)).toBe(1);
    expect(clampPage(NaN, 11, 10)).toBe(1);
  });

  it('slices the requested page, 1-indexed', () => {
    expect(pageSlice([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
  });

  it('slices a short final page', () => {
    expect(pageSlice([1, 2, 3, 4, 5], 3, 2)).toEqual([5]);
  });

  it('slices the last page when asked for one past the end', () => {
    expect(pageSlice([1, 2, 3, 4, 5], 9, 2)).toEqual([5]);
  });
});

describe('selection', () => {
  const visible = ['a', 'b', 'c'];

  it('reports none, some and all', () => {
    expect(selectionState(new Set(), visible)).toBe('none');
    expect(selectionState(new Set(['b']), visible)).toBe('some');
    expect(selectionState(new Set(['a', 'b', 'c']), visible)).toBe('all');
  });

  it('reports none for an empty page, whatever is selected off-page', () => {
    expect(selectionState(new Set(['z']), [])).toBe('none');
  });

  it('ignores off-page ids when deciding the header state', () => {
    expect(selectionState(new Set(['a', 'b', 'c', 'z']), visible)).toBe('all');
  });

  it('selects the whole page when only some are selected', () => {
    expect([...toggleAll(new Set(['b']), visible)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('clears the page when all of it is selected', () => {
    expect([...toggleAll(new Set(['a', 'b', 'c']), visible)]).toEqual([]);
  });

  it('leaves off-page selections alone in both directions', () => {
    expect([...toggleAll(new Set(['z']), visible)].sort()).toEqual(['a', 'b', 'c', 'z']);
    expect([...toggleAll(new Set(['a', 'b', 'c', 'z']), visible)]).toEqual(['z']);
  });

  it('does not mutate the set it was given', () => {
    const before = new Set(['a']);
    toggleAll(before, visible);
    toggleOne(before, 'q');
    expect([...before]).toEqual(['a']);
  });

  it('toggles one id on and off', () => {
    expect([...toggleOne(new Set(), 'a')]).toEqual(['a']);
    expect([...toggleOne(new Set(['a']), 'a')]).toEqual([]);
  });
});

describe('toCsv', () => {
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'qty', header: 'Qty' },
  ];

  it('writes a header row and CRLF line endings', () => {
    const csv = toCsv([row('a', 'Arun', 3, true, '0')], columns, accessors);
    expect(csv).toBe('Name,Qty\r\nArun,3');
  });

  it('writes an empty cell for null', () => {
    expect(toCsv([row('a', 'Bala', null, true, '0')], columns, accessors)).toBe('Name,Qty\r\nBala,');
  });

  it('writes only the header when there are no rows', () => {
    expect(toCsv([], columns, accessors)).toBe('Name,Qty');
  });

  it('writes an empty cell for a column with no accessor', () => {
    const csv = toCsv([row('a', 'Arun', 3, true, '0')], [{ key: 'ghost', header: 'Ghost' }], accessors);
    expect(csv).toBe('Ghost\r\n');
  });

  it.each([
    ['a,b', '"a,b"'],
    ['a"b', '"a""b"'],
    ['a\nb', '"a\nb"'],
  ])('quotes %o as %o', (name, expected) => {
    const csv = toCsv([row('a', name, 1, true, '0')], columns, accessors);
    expect(csv).toBe(`Name,Qty\r\n${expected},1`);
  });

  it('defuses a formula so a spreadsheet cannot execute it', () => {
    const csv = toCsv([row('a', '=cmd|\' /C calc\'!A0', 1, true, '0')], columns, accessors);
    expect(csv).toBe('Name,Qty\r\n\'=cmd|\' /C calc\'!A0,1');
  });

  it.each(['+1+cmd', '@SUM(A1)', '-1+cmd'])('defuses the formula lead in %o', (name) => {
    const csv = toCsv([row('a', name, 1, true, '0')], columns, accessors);
    expect(csv).toContain(`\r\n'${name},`);
  });

  it('leaves a negative number alone — it is not a formula', () => {
    const csv = toCsv([row('a', '-500', 1, true, '0')], columns, accessors);
    expect(csv).toBe('Name,Qty\r\n-500,1');
  });
});
