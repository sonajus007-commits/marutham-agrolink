import type { CSSProperties } from 'react';
import type { PipelineNode } from '@marutham/lib';

/* Presentational order tracker — a faithful React port of renderPipelineHTML
 * from the legacy dashboard/common.js. Fed by @marutham/lib buildPipeline().
 * Reusable by any role's order view (Agent, Consumer, Farmer, Admin). */

const NODE_W = 66;

type GapKind = 'green' | 'dash' | 'grey';

function gapKind(nodes: PipelineNode[], i: number): GapKind {
  const a = nodes[i];
  const b = nodes[i + 1];
  if (a.skipped || b.skipped) return 'dash';
  if (b.status === 'done' || b.status === 'active') return 'green';
  return 'grey';
}

function Connector({ kind }: { kind: GapKind | 'spacer' }) {
  if (kind === 'spacer') return <div style={{ flex: 1 }} />;
  if (kind === 'green') return <div style={{ flex: 1, height: 2, background: '#1a7a4a' }} />;
  if (kind === 'dash') return <div style={{ flex: 1, height: 0, borderTop: '2px dashed #cbd5e1' }} />;
  return <div style={{ flex: 1, height: 2, background: '#e2e8f0' }} />;
}

export function OrderPipeline({ nodes, activeColor = '#f4a261' }: { nodes: PipelineNode[]; activeColor?: string }) {
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
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as CSSProperties}>
      <div style={{ position: 'relative', width: totalW, minWidth: totalW }}>
        <div style={{ display: 'flex' }}>
          {nodes.map((node, i) => {
            const done = node.status === 'done';
            const active = node.status === 'active';
            const skipped = node.status === 'skipped';
            const green = done || (active && node.label === 'Delivered');
            const dotBg = green ? '#1a7a4a' : active ? activeColor : '#e2e8f0';
            const dotBd = green ? '#1a7a4a' : active ? activeColor : '#cbd5e1';
            const lblCl = green ? '#1a7a4a' : active ? activeColor : '#94a3b8';
            const glow: CSSProperties =
              green && active
                ? { boxShadow: '0 0 0 4px rgba(26,122,74,.22)' }
                : active
                  ? { boxShadow: '0 0 0 4px rgba(244,162,97,.22)' }
                  : {};

            return (
              <div
                key={node.label}
                style={{ width: NODE_W, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: 22 }}>
                  <Connector kind={i > 0 ? gapKind(nodes, i - 1) : 'spacer'} />
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: dotBg,
                      border: `2px ${skipped ? 'dashed' : 'solid'} ${dotBd}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      opacity: skipped ? 0.55 : 1,
                      ...glow,
                    }}
                  >
                    {green ? (
                      <span style={{ fontSize: 10, color: '#fff' }}>✓</span>
                    ) : active ? (
                      <span style={{ fontSize: 7, color: '#fff' }}>●</span>
                    ) : null}
                  </div>
                  <Connector kind={i < N - 1 ? gapKind(nodes, i) : 'spacer'} />
                </div>
                <div
                  style={{
                    fontSize: 8,
                    textAlign: 'center',
                    marginTop: 5,
                    color: lblCl,
                    fontWeight: active ? 700 : 400,
                    lineHeight: 1.25,
                    maxWidth: NODE_W - 4,
                    textDecoration: skipped ? 'line-through' : 'none',
                    opacity: skipped ? 0.7 : 1,
                  }}
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
                <svg width={totalW} height={30} style={{ display: 'block', overflow: 'visible', marginTop: 2 }}>
                  <path
                    d={`M ${x1} 1 L ${x1} ${depth} L ${x2} ${depth} L ${x2} 8`}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                  <path d={`M ${x2 - 4} 8 L ${x2 + 4} 8 L ${x2} 1 Z`} fill="#94a3b8" />
                  <text x={midX} y={depth + 8} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight={700}>
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
