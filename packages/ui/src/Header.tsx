import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { cn } from './lib/cn';

/* The top bar of the Admin / Executive shell, the horizontal partner to
 * <Sidebar>. Like <ChartContainer> it is chrome, not content: it lays out and
 * spaces a set of slots the app fills with the pieces already built — a
 * <Breadcrumbs> trail, a <SearchInput>, a <NotificationCenter>, a user
 * <Dropdown>. It owns none of them, so it stays free of i18n, auth and routing.
 *
 * Responsive by design. Below `lg` the sidebar is a drawer, so the header grows
 * a hamburger (wired to `onMenuClick`) and shows `brand`; the breadcrumb and
 * search — which need width — drop away until `md`. The actions cluster is the
 * one region always visible, because notifications and the account menu must be
 * reachable at every width.
 *
 * A `<header>` is a `banner` landmark; there is exactly one per page, so the
 * shell renders one Header and the modules fill its slots. */

export interface HeaderProps {
  /** Toggles the mobile sidebar drawer; renders a hamburger, hidden at `lg`+. */
  onMenuClick?: () => void;
  /** Shown beside the hamburger below `lg`, where the sidebar's brand is gone. */
  brand?: ReactNode;
  /** Left region — usually a <Breadcrumbs>. Hidden below `md`. */
  breadcrumbs?: ReactNode;
  /** Middle region — a <SearchInput>. Grows to fill; hidden below `md`. */
  search?: ReactNode;
  /** Right cluster — <NotificationCenter>, a user <Dropdown>, a language switch.
   *  Always visible. */
  actions?: ReactNode;
  'aria-label'?: string;
  className?: string;
}

export function Header({
  onMenuClick,
  brand,
  breadcrumbs,
  search,
  actions,
  'aria-label': ariaLabel = 'Top bar',
  className,
}: HeaderProps) {
  return (
    <header
      aria-label={ariaLabel}
      className={cn(
        'sticky top-0 z-[var(--z-sticky)] flex h-14 shrink-0 items-center gap-3',
        'border-b border-border-subtle bg-surface px-4',
        className,
      )}
    >
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className={cn(
            'inline-flex shrink-0 cursor-pointer appearance-none items-center justify-center lg:hidden',
            'rounded-sm border-0 bg-transparent p-2 text-fg-muted',
            'hover:bg-surface-muted hover:text-fg',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf',
          )}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      ) : null}

      {brand ? <div className="shrink-0 lg:hidden">{brand}</div> : null}

      {breadcrumbs ? <div className="hidden min-w-0 md:block">{breadcrumbs}</div> : null}

      {search ? <div className="hidden max-w-md flex-1 md:block">{search}</div> : null}

      {/* ml-auto pins the actions right whether or not the search grows the middle. */}
      <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>
    </header>
  );
}
