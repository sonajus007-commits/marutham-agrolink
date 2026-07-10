import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './lib/cn';

/* The trail to the current screen.
 *
 * `packages/ui` does not depend on react-router, and it should not: a crumb
 * carries an `href` for a real link, or an `onClick` for a router `navigate`.
 * The caller chooses; this component only knows how to draw the trail.
 *
 * The last crumb is the current page. It is never a link — a link to where you
 * already are is a trap for a screen-reader user — so it renders as text
 * carrying `aria-current="page"`.
 *
 * `maxItems` collapses the middle behind an ellipsis that expands on click. The
 * map hierarchy in packages/maps is seven levels deep — country → state →
 * district → taluk → village → hub → farmer — and a seven-crumb trail wraps
 * onto two lines on a phone. The hidden crumbs stay reachable, which is why the
 * ellipsis is a button and not the `…` character. */

export interface Crumb {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface BreadcrumbsProps {
  items: Crumb[];
  /** Total entries to show, ellipsis included. Below 3, nothing collapses. */
  maxItems?: number;
  className?: string;
}

const LINK =
  'appearance-none border-0 bg-transparent p-0 font-sans text-xs cursor-pointer ' +
  'text-fg-muted hover:text-primary hover:underline ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf';

function CrumbLabel({ item, isLast }: { item: Crumb; isLast: boolean }): ReactNode {
  if (isLast) {
    return (
      <span aria-current="page" className="text-xs font-bold text-fg">
        {item.label}
      </span>
    );
  }
  if (item.href) {
    return (
      <a href={item.href} className={LINK}>
        {item.label}
      </a>
    );
  }
  if (item.onClick) {
    return (
      <button type="button" onClick={item.onClick} className={LINK}>
        {item.label}
      </button>
    );
  }
  return <span className="text-xs text-fg-muted">{item.label}</span>;
}

export function Breadcrumbs({ items, maxItems = 0, className }: BreadcrumbsProps) {
  const [expanded, setExpanded] = useState(false);

  const collapsing = maxItems >= 3 && !expanded && items.length > maxItems;
  const tail = maxItems - 2;
  const hiddenCount = collapsing ? items.length - 1 - tail : 0;

  /* Indices are carried through the collapse so the last crumb is still
   * identified against the full list, not the visible slice. */
  const shown: (number | 'ellipsis')[] = collapsing
    ? [0, 'ellipsis', ...items.slice(items.length - tail).map((_, i) => items.length - tail + i)]
    : items.map((_, i) => i);

  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {shown.map((entry, position) => (
          <li key={entry === 'ellipsis' ? 'ellipsis' : entry} className="flex items-center gap-1.5">
            {position > 0 ? (
              <ChevronRight size={12} aria-hidden="true" className="text-neutral-400" />
            ) : null}

            {entry === 'ellipsis' ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className={cn(LINK, 'font-bold')}
                aria-label={'Show ' + hiddenCount + ' hidden levels'}
              >
                …
              </button>
            ) : (
              <CrumbLabel item={items[entry]!} isLast={entry === items.length - 1} />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
