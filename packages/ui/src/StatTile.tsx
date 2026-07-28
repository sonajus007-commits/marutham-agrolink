import type { ReactNode } from 'react';
import { cn } from './lib/cn';

export interface StatTileProps {
  /** Emoji today, a Lucide icon once the screens are migrated. */
  icon?: ReactNode;
  label: string;
  value: string | number;
  hint?: string | null;
  /** Optional accent colour applied to the value. */
  accent?: string;
  /**
   * Makes the tile a filter control. When present the tile renders as a
   * <button>; omit it and the tile stays a plain <div>, so every existing
   * read-only usage is untouched.
   */
  onClick?: () => void;
  /** Selected state for an interactive tile — drives the ring and aria-pressed. */
  selected?: boolean;
  className?: string;
}

export function StatTile({
  icon,
  label,
  value,
  hint,
  accent,
  onClick,
  selected,
  className,
}: StatTileProps) {
  const base = 'bg-surface rounded-base p-3 text-center shadow-xs border';
  const inner = (
    <>
      <div
        className="text-2xl font-black text-primary"
        style={accent ? { color: accent } : undefined}
      >
        {icon ? <span aria-hidden="true">{icon} </span> : null}
        {value}
      </div>
      <div className="text-2xs font-bold uppercase tracking-wider text-fg-muted mt-1">{label}</div>
      {hint ? <div className="text-xs text-fg-muted mt-0.5">{hint}</div> : null}
      {/* A non-colour cue for the selected filter: the bar is present or absent,
          a shape change a colour-blind user still reads (axe flagged colour-only
          state on the exec dashboard). */}
      {onClick ? (
        <div
          aria-hidden="true"
          className={cn(
            'mx-auto mt-2 h-0.5 w-8 rounded-full transition-opacity',
            selected ? 'bg-primary opacity-100' : 'opacity-0',
          )}
        />
      ) : null}
    </>
  );

  if (!onClick) {
    return <div className={cn(base, 'border-surface-muted', className)}>{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        base,
        'w-full cursor-pointer transition hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf',
        selected ? 'border-primary shadow-base' : 'border-surface-muted',
        className,
      )}
    >
      {inner}
    </button>
  );
}
