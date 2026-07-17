import type { PipelineNode } from '@marutham/lib';
import { cn } from './lib/cn';

/**
 * Compact, fixed-width progress bar for order summary cards.
 *
 * The full <OrderPipeline> is ~530px of horizontally-scrollable nodes, which
 * neither fits a phone-width card nor may be nested inside a tappable card
 * (a scroll region inside a <button> is unreachable by touch and invalid for
 * assistive tech). This shows the same state as one segment per live stage.
 * Stages the route bypasses are excluded rather than struck through.
 */
export function OrderProgress({
  nodes,
  labelFor,
  stepText = (step, total) => (step > 0 ? `Step ${step} of ${total}` : `${total} steps`),
}: {
  nodes: PipelineNode[];
  /** Speak a stage label. Defaults to the English label from buildPipeline. */
  labelFor?: (label: string) => string;
  /** Speak "Step 3 of 8" / "8 steps" (step is 0 when nothing is reached). */
  stepText?: (step: number, total: number) => string;
}) {
  const live = nodes.filter((n) => !n.skipped);
  const activeIdx = live.findIndex((n) => n.status === 'active');
  // No active node (e.g. a cancelled order) → nothing is lit.
  const reached = activeIdx < 0 ? live.filter((n) => n.status === 'done').length : activeIdx + 1;
  const raw = activeIdx >= 0 ? live[activeIdx].label : null;
  const current = raw !== null && labelFor ? labelFor(raw) : raw;
  const step = stepText(reached, live.length);

  return (
    <div className="mt-2.5 mb-0.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-primary">{current ?? '—'}</span>
        <span className="shrink-0 text-2xs text-fg-muted">{step}</span>
      </div>
      <div
        className="flex gap-[3px]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={live.length}
        aria-valuenow={reached}
        aria-valuetext={current ? `${current}, ${step}` : undefined}
      >
        {live.map((n, i) => (
          <span
            key={n.label}
            className={cn(
              'h-1 flex-1 rounded-[2px]',
              i === reached - 1 ? 'bg-sun' : i < reached ? 'bg-success' : 'bg-neutral-200',
            )}
          />
        ))}
      </div>
    </div>
  );
}
