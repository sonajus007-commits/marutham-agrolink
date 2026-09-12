import type { ReactNode } from 'react';
import { cn } from './lib/cn';

/* The scan-first floating action button the field roles carry (VCO "Scan order",
 * Hub Incharge "Scan package"). Round, thumb-reachable, and raised above the
 * content. Sits clear of the bottom nav by default via a safe-area-aware offset;
 * pass `inline` to drop it into normal flow instead (e.g. inside a header).
 *
 * An icon-only FAB still needs a name for a screen reader — pass `label`, which
 * doubles as the visible caption when `extended` is set (a pill FAB). */

export interface ScanFabProps {
  onClick: () => void;
  icon: ReactNode;
  /** Accessible name; also the visible caption when `extended`. */
  label: string;
  /** Render a wider pill FAB with the label beside the icon. */
  extended?: boolean;
  /** Drop into normal flow instead of floating above the bottom nav. */
  inline?: boolean;
  className?: string;
}

export function ScanFab({ onClick, icon, label, extended, inline, className }: ScanFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'z-[var(--z-sticky)] inline-flex cursor-pointer items-center justify-center gap-2 border-0 bg-primary font-sans font-bold text-primary-on shadow-base',
        'transition-[transform,background-color] duration-[var(--duration-base)] ease-standard active:translate-y-px enabled:hover:bg-primary-hover',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf',
        extended ? 'rounded-pill px-5 py-3.5 text-md' : 'h-14 w-14 rounded-full text-md',
        !inline && 'fixed right-4 bottom-[calc(5rem_+_env(safe-area-inset-bottom))]',
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </span>
      {extended ? <span>{label}</span> : null}
    </button>
  );
}
