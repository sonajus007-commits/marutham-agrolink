import type { CSSProperties } from 'react';
import type { PipelineNode } from '@marutham/lib';
import { cn } from './lib/cn';

/* Presentational order tracker — a faithful React port of renderPipelineHTML
 * from the legacy dashboard/common.js. Fed by @marutham/lib buildPipeline().
 * Reusable by any role's order view (Agent, Consumer, Farmer, Admin).
 *
 * Geometry stays in inline styles: node width drives the SVG path arithmetic
 * below, so a class name would only hide the number the maths needs. Colour is
 * inline for the same reason — `activeColor` is a runtime string. Everything
 * static is a utility. */

const NODE_W = 66;

type GapKind = 'green' | 'dash' | 'grey';

function gapKind(nodes: PipelineNode[], i: number): GapKind {
  const a = nodes[i];
  const b = nodes[i + 1];
  if (a.skipped || b.skipped) return 'dash';
  if (b.status === 'done' || b.status === 'active') return 'green';
  return 'grey';
}

/** The 4px halo behind a live node, derived from the node's own colour.
 *
 * These were two hard-coded rgba() values — success at 22%, sun at 22% — which
 * meant a caller passing a custom `activeColor` got an orange glow around a
 * differently-coloured dot. Mixing from the dot's colour keeps them in step, and
 * leaves no literal behind. */
const glow = (color: string): CSSProperties => ({
  boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)`,
});

function Connector({ kind }: { kind: GapKind | 'spacer' }) {
  if (kind === 'spacer') return <div className="flex-1" />;
  if (kind === 'green') return <div className="h-0.5 flex-1 bg-success" />;
  if (kind === 'dash')
    return <div className="h-0 flex-1 border-t-2 border-dashed border-neutral-300" />;
  return <div className="h-0.5 flex-1 bg-neutral-200" />;
}

export function OrderPipeline({
  nodes,
  activeColor = 'var(--sun)',
}: {
  nodes: PipelineNode[];
  activeColor?: string;
}) {
  const N = nodes.length;
  const totalW = N * NODE_W;

  // Contiguous skipped span (In Transit + At Hub).
  let s = -1;
  let e = -1;
  for (let k = 0; k < N; k++) {
    if (nodes[k].skipped) {
      if (s < 0) s = k;
      e = k;
    }
  }
  const hasSkip = s > 0 && e >= 0 && e < N - 1;

  return (
    <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <div className="relative" style={{ width: totalW, minWidth: totalW }}>
        <div className="flex">
          {nodes.map((node, i) => {
            const done = node.status === 'done';
            const active = node.status === 'active';
            const skipped = node.status === 'skipped';
            const green = done || (active && node.label === 'Delivered');
            const dotBg = green ? 'var(--success)' : active ? activeColor : 'var(--neutral-200)';
            const dotBd = green ? 'var(--success)' : active ? activeColor : 'var(--neutral-300)';
            const lblCl = green ? 'var(--success)' : active ? activeColor : 'var(--neutral-400)';

            return (
              <div
                key={node.label}
                className="flex shrink-0 flex-col items-center"
                style={{ width: NODE_W }}
              >
                <div className="flex h-[22px] w-full items-center">
                  <Connector kind={i > 0 ? gapKind(nodes, i - 1) : 'spacer'} />
                  <div
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full',
                      skipped && 'opacity-55',
                    )}
                    style={{
                      background: dotBg,
                      border: `2px ${skipped ? 'dashed' : 'solid'} ${dotBd}`,
                      ...(active ? glow(dotBg) : {}),
                    }}
                  >
                    {green ? (
                      <span className="text-[10px] text-white">✓</span>
                    ) : active ? (
                      <span className="text-[7px] text-white">●</span>
                    ) : null}
                  </div>
                  <Connector kind={i < N - 1 ? gapKind(nodes, i) : 'spacer'} />
                </div>
                <div
                  className={cn(
                    'mt-[5px] text-center text-[8px] leading-[1.25]',
                    active ? 'font-bold' : 'font-normal',
                    skipped && 'line-through opacity-70',
                  )}
                  style={{ color: lblCl, maxWidth: NODE_W - 4 }}
                >
                  {node.label}
                </div>
              </div>
            );
          })}
        </div>

        {hasSkip
          ? (() => {
              const x1 = (s - 1) * NODE_W + NODE_W / 2;
              const x2 = (e + 1) * NODE_W + NODE_W / 2;
              const midX = (x1 + x2) / 2;
              const depth = 20;
              return (
                <svg width={totalW} height={30} className="mt-0.5 block overflow-visible">
                  <path
                    d={`M ${x1} 1 L ${x1} ${depth} L ${x2} ${depth} L ${x2} 8`}
                    fill="none"
                    stroke="var(--neutral-400)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                  <path d={`M ${x2 - 4} 8 L ${x2 + 4} 8 L ${x2} 1 Z`} fill="var(--neutral-400)" />
                  <text
                    x={midX}
                    y={depth + 8}
                    textAnchor="middle"
                    fontSize={8}
                    fill="var(--neutral-400)"
                    fontWeight={700}
                  >
                    skips ahead
                  </text>
                </svg>
              );
            })()
          : null}
      </div>
    </div>
  );
}
