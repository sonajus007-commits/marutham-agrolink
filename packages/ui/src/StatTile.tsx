import type { ReactNode, CSSProperties } from 'react';
import { cn } from './lib/cn';

/* Tone drives the tinted icon chip. Kept to the brand's own hues (greens + the
 * pink/gold accents) so a wall of tiles reads as one system rather than a
 * rainbow. The chip is a soft wash of the hue with the icon in the full hue. */
export type StatTone = 'green' | 'leaf' | 'pink' | 'gold';
const TONE_VAR: Record<StatTone, string> = {
  green: '--forest',
  leaf: '--leaf',
  pink: '--accent',
  gold: '--gold',
};

export interface StatTileProps {
  /** A line icon (preferred) or an emoji. Rendered inside a tinted chip. */
  icon?: ReactNode;
  /** Tint for the icon chip. Defaults to brand green. */
  tone?: StatTone;
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
  tone = 'green',
  label,
  value,
  hint,
  accent,
  onClick,
  selected,
  className,
}: StatTileProps) {
  const toneVar = TONE_VAR[tone];
  const base =
    'ma-stat bg-surface rounded-xl p-4 text-left shadow-xs border flex flex-col items-start gap-0';
  const inner = (
    <>
      {icon ? (
        <span
          aria-hidden="true"
          className="ma-chip mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl text-[1.1rem] [&_svg]:h-[1.3rem] [&_svg]:w-[1.3rem]"
          style={{ '--chip-hue': `var(${toneVar})` } as CSSProperties}
        >
          {icon}
        </span>
      ) : null}
      <div
        className="text-primary text-2xl leading-none font-extrabold"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      <div className="text-2xs text-fg-muted mt-1.5 font-bold tracking-wider uppercase">
        {label}
      </div>
      {hint ? <div className="text-xs text-fg-muted mt-0.5">{hint}</div> : null}
      {/* A non-colour cue for the selected filter: the bar is present or absent,
          a shape change a colour-blind user still reads (axe flagged colour-only
          state on the exec dashboard). */}
      {onClick ? (
        <div
          aria-hidden="true"
          className={cn(
            'mt-2.5 h-0.5 w-8 rounded-full transition-opacity',
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
        'w-full cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf',
        selected ? 'border-primary shadow-base' : 'border-surface-muted',
        className,
      )}
    >
      {inner}
    </button>
  );
}
