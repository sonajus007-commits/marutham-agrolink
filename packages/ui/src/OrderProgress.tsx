import type { PipelineNode } from '@marutham/lib';

/**
 * Compact, fixed-width progress bar for order summary cards.
 *
 * The full <OrderPipeline> is ~530px of horizontally-scrollable nodes, which
 * neither fits a phone-width card nor may be nested inside a tappable card
 * (a scroll region inside a <button> is unreachable by touch and invalid for
 * assistive tech). This shows the same state as one segment per live stage.
 * Stages the route bypasses are excluded rather than struck through.
 */
export function OrderProgress({ nodes }: { nodes: PipelineNode[] }) {
  const live = nodes.filter((n) => !n.skipped);
  const activeIdx = live.findIndex((n) => n.status === 'active');
  // No active node (e.g. a cancelled order) → nothing is lit.
  const reached = activeIdx < 0 ? live.filter((n) => n.status === 'done').length : activeIdx + 1;
  const current = activeIdx >= 0 ? live[activeIdx].label : null;

  return (
    <div className="ma-progress">
      <div className="ma-progress__head">
        <span className="ma-progress__label">{current ?? '—'}</span>
        <span className="ma-progress__count">
          {reached > 0 ? `Step ${reached} of ${live.length}` : `${live.length} steps`}
        </span>
      </div>
      <div
        className="ma-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={live.length}
        aria-valuenow={reached}
        aria-valuetext={current ? `${current}, step ${reached} of ${live.length}` : undefined}
      >
        {live.map((n, i) => (
          <span key={n.label} className={`ma-progress__seg${i < reached ? ' is-filled' : ''}${i === reached - 1 ? ' is-current' : ''}`} />
        ))}
      </div>
    </div>
  );
}
