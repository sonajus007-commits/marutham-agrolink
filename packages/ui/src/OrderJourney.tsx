import { Check } from 'lucide-react';
import { fmtDate, type PipelineNode, type OrderHistoryEntry } from '@marutham/lib';
import { cn } from './lib/cn';
import { StatusPill } from './StatusPill';

/**
 * The order's journey as a vertical, mobile-first timeline — the reference's
 * signature tracking screen:
 *
 *   ● Order Placed        12 Sep, 10:04 AM
 *   ● Farmer Packing      12 Sep, 10:40 AM
 *   ◉ VCO Verified        · Current
 *   ○ Picked Up
 *   ○ Out for Delivery
 *   ○ Delivered
 *
 * Unlike <OrderTimeline> (which lists only what has HAPPENED, from order history)
 * this shows the WHOLE pipeline: done stages with their timestamp, the current
 * stage highlighted, and upcoming stages as hollow markers — so a buyer sees
 * where the order is AND what is left. Feed it `buildPipeline(route, status)`
 * plus the order's `history` (timestamps are matched to stages by label).
 *
 * Skipped stages (hub-only stages on a direct order) are dropped, matching the
 * horizontal <OrderPipeline> and <OrderProgress>.
 */
export function OrderJourney({
  nodes,
  history = [],
  labelFor,
  lang,
  currentLabel,
  etaLabel,
}: {
  nodes: PipelineNode[];
  /** Order status history — timestamps are matched to stages by label. */
  history?: OrderHistoryEntry[];
  /** Speak a stage label. Defaults to the English label from buildPipeline. */
  labelFor?: (label: string) => string;
  /** App language for the timestamps. Defaults to en-IN. */
  lang?: string;
  /** Text on the current stage's pill. Defaults to "Current". */
  currentLabel?: string;
  /** Optional ETA/expected line shown under the current stage (e.g. "by 6 PM"). */
  etaLabel?: string;
}) {
  const live = nodes.filter((n) => !n.skipped);
  if (!live.length) return null;

  // Last timestamp recorded for each stage label (history is oldest-first).
  const tsByLabel = new Map<string, string>();
  for (const h of history) if (h.ts) tsByLabel.set(h.label, h.ts);

  const lastIdx = live.length - 1;

  return (
    <ol className="m-0 list-none p-0">
      {live.map((n, i) => {
        const done = n.status === 'done';
        const active = n.status === 'active';
        const ts = tsByLabel.get(n.label);
        return (
          <li key={n.label} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Connecting rail — green where the path is already travelled. */}
            {i < lastIdx ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-5 bottom-0 left-[9px] w-0.5',
                  done ? 'bg-success' : 'bg-neutral-200',
                )}
              />
            ) : null}
            {/* Marker: filled + check (done), ringed (current), hollow (upcoming). */}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-[1] grid size-5 shrink-0 place-items-center rounded-full',
                done && 'bg-success text-primary-on',
                active && 'bg-leaf shadow-[0_0_0_3px_var(--focus-ring-strong)]',
                !done && !active && 'border-2 border-neutral-300 bg-surface',
              )}
            >
              {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              {active ? <span className="size-1.5 rounded-full bg-primary-on" /> : null}
            </span>
            <div className={cn('min-w-0 flex-1', active ? '-mt-0.5' : '')}>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'font-sans font-bold',
                    active
                      ? 'text-base text-primary'
                      : done
                        ? 'text-sm text-fg'
                        : 'text-sm text-fg-muted',
                  )}
                >
                  {labelFor ? labelFor(n.label) : n.label}
                </span>
                {active ? (
                  <StatusPill tone="info" size="sm" dot>
                    {currentLabel ?? 'Current'}
                  </StatusPill>
                ) : null}
              </div>
              {ts ? <div className="mt-0.5 text-xs text-fg-muted">{fmtDate(ts, lang)}</div> : null}
              {active && etaLabel ? (
                <div className="mt-0.5 text-sm font-semibold text-forest">{etaLabel}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
