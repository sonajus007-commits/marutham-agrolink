/* Table data operations — sort, filter, paginate, select, export.
 *
 * Pure and DOM-free, so it is testable without a renderer and portable to a
 * React Native table later. The rendering lives in @marutham/ui <Table>.
 *
 * Everything here is keyed by a column `key` and reads cells through an
 * accessor map, so the logic never needs to know what a column renders. */

export type CellValue = string | number | boolean | null | undefined;

/** A non-empty cell. Sorting and comparison only ever see these. */
export type Cell = string | number | boolean;

export type Accessor<T> = (row: T) => CellValue;
export type Accessors<T> = Record<string, Accessor<T>>;

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  key: string;
  dir: SortDirection;
}

/**
 * Advance a header through the three-state sort cycle: unsorted → ascending →
 * descending → unsorted. Clicking a different column starts that column at
 * ascending rather than inheriting the previous column's direction.
 */
export function nextSort(current: SortState | null, key: string): SortState | null {
  if (current?.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}

/**
 * Order two non-empty cells.
 *
 * Same-typed cells compare by their own semantics — numerically, or `false`
 * before `true`. Strings use numeric collation, so `Item 9` precedes `Item 10`
 * rather than following it as a plain codepoint sort would.
 *
 * Mixed types fall back to comparing their string forms under that same numeric
 * collation. This is not a curiosity: the API returns Postgres `numeric` as a
 * string, so one column can genuinely hold `1200.50` and `900` in different
 * rows, and stringified numeric collation is the only comparison that puts them
 * in the order a reader expects.
 */
export function compareCells(a: Cell, b: Cell): number {
  if (typeof a === typeof b) {
    if (typeof a === 'number') return a - (b as number);
    if (typeof a === 'boolean') return a === b ? 0 : a ? 1 : -1;
    return (a as string).localeCompare(b as string, undefined, { numeric: true });
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Sort a copy of `rows`. Returns `rows` untouched when there is nothing to do,
 * so an unsorted table does not churn its identity on every render.
 *
 * Empty cells (`null` / `undefined`) sort last in *both* directions. A reversed
 * sort is meant to surface the largest values, not to promote the rows that are
 * missing the value entirely.
 *
 * `Array.prototype.sort` is stable per spec, so rows that tie keep the order
 * they arrived in — which is what makes sorting by one column and then another
 * behave the way users expect.
 */
export function sortRows<T>(
  rows: readonly T[],
  sort: SortState | null,
  accessors: Accessors<T>,
): readonly T[] {
  const read = sort && accessors[sort.key];
  if (!sort || !read) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;

  return [...rows].sort((ra, rb) => {
    const a = read(ra);
    const b = read(rb);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return sign * compareCells(a, b);
  });
}

/**
 * Keep the rows matching every whitespace-separated term in `query`. A term
 * matches when it is a case-insensitive substring of any accessible cell, so
 * `ram 622001` finds the row whose name is in one column and pincode another.
 */
export function filterRows<T>(
  rows: readonly T[],
  query: string,
  accessors: Accessors<T>,
): readonly T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return rows;
  const reads = Object.values(accessors);

  return rows.filter((row) => {
    const haystack = reads.map((read) => String(read(row) ?? '').toLowerCase());
    return terms.every((term) => haystack.some((cell) => cell.includes(term)));
  });
}

/* ── Pagination ────────────────────────────────────────────────────────────
 * Pages are 1-indexed, matching what the footer shows. A `pageSize` of 0 means
 * "no pagination" and every function degrades to a single page holding
 * everything. */

export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Hold `page` inside `[1, pageCount]`. Filtering a table down to one page of
 * results while the reader sits on page 7 must not show them an empty table. */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, Math.trunc(page) || 1), pageCount(total, pageSize));
}

export function pageSlice<T>(rows: readonly T[], page: number, pageSize: number): readonly T[] {
  if (pageSize <= 0) return rows;
  const p = clampPage(page, rows.length, pageSize);
  return rows.slice((p - 1) * pageSize, p * pageSize);
}

/* ── Selection ─────────────────────────────────────────────────────────────
 * Selection is a set of row ids, not row objects: it has to survive a refetch
 * that replaces every row identity, and a page change that unmounts the rows. */

export type SelectionState = 'none' | 'some' | 'all';

/** Which box the header checkbox shows: empty, indeterminate, or checked. */
export function selectionState(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): SelectionState {
  if (!visibleIds.length) return 'none';
  const hits = visibleIds.reduce((n, id) => n + (selected.has(id) ? 1 : 0), 0);
  if (hits === 0) return 'none';
  return hits === visibleIds.length ? 'all' : 'some';
}

/**
 * Select every visible row, or clear them if all are already selected.
 *
 * Only `visibleIds` are touched. A selection made on page 1 survives paging to
 * page 2 and toggling there — the header checkbox governs the page in front of
 * the reader, never the rows they cannot see.
 */
export function toggleAll(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  const next = new Set(selected);
  const clearing = selectionState(selected, visibleIds) === 'all';
  for (const id of visibleIds) {
    if (clearing) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

/* ── CSV export ────────────────────────────────────────────────────────────*/

export interface CsvColumn {
  key: string;
  header: string;
}

/** Leading characters that make a spreadsheet treat a cell as a formula. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * Render one cell per RFC 4180, defusing spreadsheet formula injection on the
 * way out.
 *
 * A cell of `=cmd|' /C calc'!A0` is a live formula the moment the file opens in
 * Excel, and the values here come from user-controlled fields like a farmer's
 * name. Prefixing an apostrophe forces it to text. Negative numbers also lead
 * with `-`, so a cell that parses as a finite number is exempt — otherwise
 * every `-500` in the export would arrive as the string `'-500`.
 */
function csvCell(value: CellValue): string {
  let s = value == null ? '' : String(value);
  if (FORMULA_LEAD.test(s) && !Number.isFinite(Number(s))) s = `'${s}`;
  if (/["\n\r,]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Serialize rows to CSV text, header row first. Fields are CRLF-separated per
 * RFC 4180, which is also what Excel expects.
 *
 * The caller decides what `rows` holds — this is where "export respects the
 * current filter and sort" is honoured, by handing in the rows already filtered
 * and sorted rather than the raw set.
 */
export function toCsv<T>(
  rows: readonly T[],
  columns: readonly CsvColumn[],
  accessors: Accessors<T>,
): string {
  const header = columns.map((c) => csvCell(c.header));
  const body = rows.map((row) => columns.map((c) => csvCell(accessors[c.key]?.(row))));
  return [header, ...body].map((cells) => cells.join(',')).join('\r\n');
}
