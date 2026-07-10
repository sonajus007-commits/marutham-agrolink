import type { ReactNode } from 'react';

export interface StatTileProps {
  /** Emoji today, a Lucide icon once the screens are migrated. */
  icon?: ReactNode;
  label: string;
  value: string | number;
  hint?: string | null;
  /** Optional accent colour applied to the value. */
  accent?: string;
}

export function StatTile({ icon, label, value, hint, accent }: StatTileProps) {
  return (
    <div className="bg-surface border border-surface-muted rounded-base p-3 text-center shadow-xs">
      <div className="text-2xl font-black text-primary" style={accent ? { color: accent } : undefined}>
        {icon ? <span aria-hidden="true">{icon} </span> : null}
        {value}
      </div>
      <div className="text-2xs font-bold uppercase tracking-wider text-fg-muted mt-1">{label}</div>
      {hint ? <div className="text-xs text-fg-muted mt-0.5">{hint}</div> : null}
    </div>
  );
}
