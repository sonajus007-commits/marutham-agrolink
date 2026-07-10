import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  clampPage, filterRows, nextSort, pageCount, pageSlice, selectionState,
  sortRows, toCsv, toggleAll, toggleOne,
  type Accessors, type CellValue, type SortState,
} from '@marutham/lib';
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Download, Search, X,
} from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Spinner } from './Spinner';
import { cn } from './lib/cn';

/* The enterprise table: sticky header, sort, filter, pagination, CSV export and
 * bulk actions over a row selection.
 *
 * Every data operation is in @marutham/lib/table — pure, and covered by tests
 * that need no renderer. What lives here is markup, ARIA and state. The split is
 * deliberate: sorting `numeric` columns that arrive as strings, holding a
 * selection across a page change, and escaping a CSV cell are the parts that
 * break, and none of them need a DOM to prove.
 *
 * Preflight is off (see apps/web/src/tailwind.css), so the user-agent styles for
 * `table`, `th` and `input` are still live. `border-separate`, `text-left` and
 * `appearance-none` are doing reset work, not decoration. They come out with
 * preflight in Phase 4.
 *
 * `border-separate` is also load-bearing for the sticky header: under
 * `border-collapse: collapse` the borders belong to the table rather than the
 * cell, and Chrome scrolls a sticky header's bottom border away from it. With
 * borders owned by the cells, the header keeps its rule. */

export interface TableColumn<T> {
  key: string;
  /** Column heading. A plain string, so the same text can head the CSV. */
  header: string;
  /** Cell value for sorting, filtering and export. Defaults to `row[key]`. */
  value?: (row: T) => CellValue;
  /** Cell content. Defaults to the column's value, rendered as text. */
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Default `true`. Set `false` on an actions column. */
  sortable?: boolean;
  /** Default `true`. Set `false` on an actions column. */
  exportable?: boolean;
  width?: string;
}

export interface TableProps<T> {
  rows: readonly T[];
  columns: TableColumn<T>[];
  /** Stable identity for a row. Selection is held as a set of these. */
  rowId: (row: T) => string;
  /** Names a row for its selection checkbox. Defaults to `rowId`, which is
   * usually a UUID — pass something a screen reader can read aloud. */
  rowLabel?: (row: T) => string;
  /** Names the table for a screen reader. Rendered visually hidden. */
  caption: string;
  loading?: boolean;
  /** Shown when `rows` is empty. Filtering to nothing has its own message. */
  empty?: ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Rows per page. `0` shows every row and hides the pager. */
  pageSize?: number;
  initialSort?: SortState;
  selectable?: boolean;
  onSelectionChange?: (ids: string[], rows: T[]) => void;
  /** Rendered in the bar that replaces the toolbar while rows are selected. */
  bulkActions?: (ids: string[], rows: T[]) => ReactNode;
  /** Enables the export button. Rows are exported filtered and sorted. */
  exportFileName?: string;
  /** A CSS length. The sticky header only sticks against a bounded scroller. */
  maxHeight?: string;
  className?: string;
}

/** Excel reads a CSV without a BOM in the local ANSI codepage, which turns every
 * Tamil name in the export into mojibake. */
function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

const TH =
  'sticky top-0 z-10 bg-surface-muted text-fg-muted text-2xs font-bold uppercase ' +
  'tracking-wide text-left px-3 py-2.5 border-b border-border-subtle whitespace-nowrap';

const TD = 'px-3 py-2.5 border-b border-border-subtle text-fg align-middle';

const SORT_BTN =
  'inline-flex items-center gap-1 appearance-none border-0 bg-transparent p-0 cursor-pointer ' +
  'font-sans font-bold text-2xs uppercase tracking-wide text-fg-muted ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf';

const CHECKBOX = 'size-4 cursor-pointer accent-primary';

export function Table<T>({
  rows, columns, rowId, rowLabel, caption,
  loading = false,
  empty = 'Nothing here yet.',
  searchable = false,
  searchPlaceholder = 'Search…',
  pageSize = 25,
  initialSort,
  selectable = false,
  onSelectionChange,
  bulkActions,
  exportFileName,
  maxHeight,
  className,
}: TableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  /* One accessor per column, so lib/table can read cells without knowing how a
   * column renders. A column that names a plain row property needs no `value`. */
  const accessors = useMemo<Accessors<T>>(() => {
    const map: Accessors<T> = {};
    for (const col of columns) {
      map[col.key] = col.value ?? ((row: T) => (row as Record<string, unknown>)[col.key] as CellValue);
    }
    return map;
  }, [columns]);

  const filtered = useMemo(() => filterRows(rows, query, accessors), [rows, query, accessors]);
  const sorted = useMemo(() => sortRows(filtered, sort, accessors), [filtered, sort, accessors]);

  const total = sorted.length;
  /* Clamped rather than stored: a refetch that shrinks the table must not strand
   * the reader on a page that no longer exists. */
  const current = clampPage(page, total, pageSize);
  const pages = pageCount(total, pageSize);
  const pageRows = useMemo(() => pageSlice(sorted, current, pageSize), [sorted, current, pageSize]);

  const visibleIds = useMemo(() => pageRows.map(rowId), [pageRows, rowId]);
  const headState = selectionState(selected, visibleIds);
  const selectedRows = useMemo(
    () => sorted.filter((row) => selected.has(rowId(row))),
    [sorted, selected, rowId],
  );

  /* `indeterminate` is a property, not an attribute — React cannot set it. */
  const headBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headBox.current) headBox.current.indeterminate = headState === 'some';
  }, [headState]);

  /* Notified from the handlers rather than an effect on `selected`: an effect
   * would also fire on mount, telling the caller about a selection it made. */
  function commit(next: Set<string>) {
    setSelected(next);
    onSelectionChange?.([...next], rows.filter((row) => next.has(rowId(row))));
  }

  function onSort(key: string) {
    setSort(nextSort(sort, key));
    setPage(1);
  }

  function onQuery(next: string) {
    setQuery(next);
    setPage(1);
  }

  function onExport() {
    if (!exportFileName) return;
    /* A selection means "export these"; without one, the export is what the
     * reader is looking at — every filtered row, in sort order, not just the
     * current page. */
    const source = selected.size ? selectedRows : sorted;
    const cols = columns.filter((c) => c.exportable !== false).map((c) => ({ key: c.key, header: c.header }));
    downloadCsv(exportFileName, toCsv(source, cols, accessors));
  }

  const selectionCount = selected.size;
  const showToolbar = searchable || exportFileName || (selectable && bulkActions);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {showToolbar ? (
        <div className="flex items-center gap-2 flex-wrap">
          {selectionCount > 0 && bulkActions ? (
            <>
              <span className="text-sm font-bold text-fg">{selectionCount} selected</span>
              {bulkActions([...selected], selectedRows)}
              <Button
                variant="ghost"
                className="px-2 py-1.5 gap-1 text-sm"
                onClick={() => commit(new Set())}
              >
                <X size={14} aria-hidden="true" />
                Clear
              </Button>
            </>
          ) : (
            searchable && (
              <div className="relative flex-1 min-w-[180px]">
                <Search
                  size={14}
                  aria-hidden="true"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => onQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className={
                    'w-full appearance-none rounded-sm border-[1.5px] border-border-strong bg-surface ' +
                    'pl-8 pr-3 py-2 font-sans text-sm text-fg outline-none ' +
                    'focus:border-leaf focus:shadow-[0_0_0_3px_var(--focus-ring)]'
                  }
                />
              </div>
            )
          )}

          {exportFileName ? (
            <Button
              variant="ghost"
              className="ml-auto px-3 py-1.5 gap-1.5 text-sm"
              onClick={onExport}
              disabled={total === 0}
            >
              <Download size={14} aria-hidden="true" />
              Export
            </Button>
          ) : null}
        </div>
      ) : null}

      <div
        className="overflow-auto rounded-base border border-border-subtle bg-surface"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full border-separate border-spacing-0 font-sans text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {selectable ? (
                <th scope="col" className={cn(TH, 'w-px')}>
                  <input
                    ref={headBox}
                    type="checkbox"
                    className={CHECKBOX}
                    checked={headState === 'all'}
                    onChange={() => commit(toggleAll(selected, visibleIds))}
                    aria-label="Select all rows on this page"
                    disabled={!visibleIds.length}
                  />
                </th>
              ) : null}

              {columns.map((col) => {
                const sortable = col.sortable !== false;
                /* Narrowed to the state object rather than a boolean, so `.dir`
                 * below is reachable without a non-null assertion. */
                const active = sort && sort.key === col.key ? sort : null;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(TH, col.align === 'right' && 'text-right')}
                    aria-sort={
                      !sortable ? undefined
                        : !active ? 'none'
                        : active.dir === 'asc' ? 'ascending'
                        : 'descending'
                    }
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className={cn(SORT_BTN, active && 'text-fg')}
                        onClick={() => onSort(col.key)}
                      >
                        {col.header}
                        {!active ? (
                          <ChevronsUpDown size={12} aria-hidden="true" className="text-neutral-400" />
                        ) : active.dir === 'asc' ? (
                          <ArrowUp size={12} aria-hidden="true" />
                        ) : (
                          <ArrowDown size={12} aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {pageRows.map((row) => {
              const id = rowId(row);
              const isSelected = selected.has(id);
              return (
                /* No `aria-selected`: on a plain `table` the implicit `row` role
                 * does not support it. The checkbox carries the state. */
                <tr key={id} className={isSelected ? 'bg-info-bg' : 'hover:bg-surface-muted'}>
                  {selectable ? (
                    <td className={cn(TD, 'w-px')}>
                      <input
                        type="checkbox"
                        className={CHECKBOX}
                        checked={isSelected}
                        onChange={() => commit(toggleOne(selected, id))}
                        aria-label={'Select ' + (rowLabel ? rowLabel(row) : id)}
                      />
                    </td>
                  ) : null}
                  {columns.map((col) => (
                    <td key={col.key} className={cn(TD, col.align === 'right' && 'text-right tabular-nums')}>
                      {col.render ? col.render(row) : String(accessors[col.key]!(row) ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {loading ? <Spinner /> : null}

        {!loading && total === 0 ? (
          <EmptyState>
            {rows.length === 0 ? (
              empty
            ) : (
              <>
                <div>No rows match “{query}”.</div>
                <Button variant="ghost" className="mt-3 px-3 py-1.5 text-sm" onClick={() => onQuery('')}>
                  Clear search
                </Button>
              </>
            )}
          </EmptyState>
        ) : null}
      </div>

      {pageSize > 0 && total > 0 ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Announced, so a filter that narrows the table tells a screen-reader
              user how far it narrowed it. */}
          <span className="text-xs text-fg-muted" aria-live="polite">
            {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, total)} of {total}
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="px-2 py-1.5"
              onClick={() => setPage(current - 1)}
              disabled={current <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <span className="text-xs text-fg-muted">
              Page {current} of {pages}
            </span>
            <Button
              variant="ghost"
              className="px-2 py-1.5"
              onClick={() => setPage(current + 1)}
              disabled={current >= pages}
              aria-label="Next page"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
