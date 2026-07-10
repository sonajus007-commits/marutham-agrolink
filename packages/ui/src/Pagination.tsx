import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageCount, clampPage } from '@marutham/lib';
import { Button } from './Button';
import { cn } from './lib/cn';

/* A compact pager: an "X–Y of Z" range and prev / next.
 *
 * Extracted from <Table>, which is its first caller; the page arithmetic —
 * `pageCount`, `clampPage` — is the tested pure logic in @marutham/lib/table, so
 * a shrinking dataset can never strand the reader on a page past the end.
 *
 * Controlled: the caller owns the page number. `page` is clamped here too, so
 * passing a stale page after the total shrinks still renders the last real page
 * rather than an empty one. */

export interface PaginationProps {
  /** Current page, 1-based. Clamped into range before anything is drawn. */
  page: number;
  pageSize: number;
  /** Total item count across all pages. */
  total: number;
  onPageChange: (page: number) => void;
  /** Show the "1–25 of 240" summary. Default true. */
  showRange?: boolean;
  className?: string;
}

export function Pagination({
  page, pageSize, total, onPageChange, showRange = true, className,
}: PaginationProps) {
  // Nothing to page through — no pager, matching <Table>'s own guard.
  if (pageSize <= 0 || total <= 0) return null;

  const pages = pageCount(total, pageSize);
  const current = clampPage(page, total, pageSize);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      {/* Announced, so a filter that narrows the set tells a screen-reader user
          how far it narrowed it. The empty span keeps the pager right-aligned
          under justify-between when the range is hidden. */}
      {showRange ? (
        <span className="text-xs text-fg-muted" aria-live="polite">
          {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, total)} of {total}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          className="px-2 py-1.5"
          onClick={() => onPageChange(current - 1)}
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
          onClick={() => onPageChange(current + 1)}
          disabled={current >= pages}
          aria-label="Next page"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
