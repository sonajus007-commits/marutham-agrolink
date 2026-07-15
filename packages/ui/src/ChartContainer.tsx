import { useId, type ReactNode } from 'react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { Alert } from './Alert';
import { cn } from './lib/cn';

/* The frame around a chart — header, a fixed-height plot area, and the
 * loading / empty / error states every dashboard tile needs and hand-rolled
 * `<Card><h2>…</h2><EChart/></Card>` blocks never had.
 *
 * It renders the *chrome*, not the chart. The chart is `children`, so this stays
 * free of any charting library — `packages/ui` must never pull in the ~1 MB
 * ECharts bundle. ECharts (or Recharts, or an RN chart) lives in the app and is
 * handed in. The plot area holds its height across all four states, so a tile
 * does not jump as data loads.
 *
 * A `<figure>` named by its `<figcaption>`: a canvas chart is opaque to a screen
 * reader, so the caption and an optional `summary` carry the meaning. */

export interface ChartContainerProps {
  title: ReactNode;
  /** A line under the title. A map passes its drill breadcrumb here. */
  subtitle?: ReactNode;
  /** Toolbar on the right of the header — a range picker, an export button. */
  action?: ReactNode;
  /** Screen-reader description of what the chart shows, beyond the title. */
  summary?: string;
  loading?: boolean;
  /** A message that replaces the plot with a danger Alert. */
  error?: ReactNode;
  /** `true`, or a custom node, when there is nothing to plot. */
  empty?: boolean | ReactNode;
  /** Plot-area height. A number is px; default 320, matching the app's EChart. */
  height?: number | string;
  /** Below the plot — a source note, or a map's legend. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartContainer({
  title,
  subtitle,
  action,
  summary,
  loading = false,
  error,
  empty = false,
  height = 320,
  footer,
  children,
  className,
}: ChartContainerProps) {
  const captionId = useId();
  const summaryId = useId();
  const minHeight = typeof height === 'number' ? height + 'px' : height;

  return (
    <figure
      aria-labelledby={captionId}
      aria-describedby={summary ? summaryId : undefined}
      className={cn(
        'm-0 flex flex-col rounded-base border border-border-subtle bg-surface p-5 shadow-base',
        className,
      )}
    >
      <figcaption className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={captionId} className="font-sans text-md font-bold text-primary">
            {title}
          </h3>
          {subtitle ? <div className="mt-0.5 text-sm text-fg-muted">{subtitle}</div> : null}
          {summary ? (
            <p id={summaryId} className="sr-only">
              {summary}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </figcaption>

      {/* One box for all four states, so the tile keeps its height as data loads. */}
      <div style={{ minHeight }} className="relative flex flex-col">
        {error ? (
          <div className="flex flex-1 items-center">
            <Alert tone="danger" className="w-full">
              {error}
            </Alert>
          </div>
        ) : loading ? (
          // aria-busy lets a screen reader know the region is updating, not empty.
          <div aria-busy="true" className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-full w-full flex-1" />
          </div>
        ) : empty ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState>{typeof empty === 'boolean' ? 'No data to show.' : empty}</EmptyState>
          </div>
        ) : (
          children
        )}
      </div>

      {footer ? <div className="mt-3">{footer}</div> : null}
    </figure>
  );
}
