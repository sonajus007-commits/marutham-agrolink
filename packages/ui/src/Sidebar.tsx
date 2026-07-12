import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { activeTrail, type NavNode } from '@marutham/lib';
import { cn } from './lib/cn';

/* The desktop navigation rail for the Admin and Executive portals.
 *
 * Not for Farmer / Consumer / VCO / Delivery — those keep the <TabBar> mobile
 * tab bar (a bottom nav suits a phone; a side rail suits a wide admin console).
 *
 * Router-agnostic, like <Breadcrumbs>: an item carries an `href` for a real link
 * or an `onClick` for a router `navigate`. The active item and the groups to
 * expand are computed from `currentPath` by @marutham/lib/nav — the same tested
 * matcher the rest of the app can share — so "which item is lit" is never a
 * second, hand-rolled string compare here.
 *
 * `collapsed` is the icon-only rail. Groups cannot expand inline while collapsed
 * (there is no room for a label), so clicking a collapsed group expands the rail
 * first. Role-gating is the caller's job via `filterNavByRole` before render;
 * this component draws what it is given. */

export interface SidebarItem extends NavNode {
  label: string;
  icon?: ReactNode;
  /** Fires on click for both the button (no href) and the link (with href). A
   *  link item can use it for SPA navigation: check for a plain left-click
   *  (no modifier keys), `preventDefault()`, and route — `href` still drives the
   *  active highlight and lets middle/modifier-click open a real tab. */
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  badge?: ReactNode;
  children?: SidebarItem[];
}

export interface SidebarSection {
  id: string;
  /** A heading above the group. Hidden in the collapsed rail. */
  label?: string;
  items: SidebarItem[];
}

export interface SidebarProps {
  sections: SidebarSection[];
  /** Current route path — drives the active highlight and which groups open. */
  currentPath?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Brand / logo block at the top. */
  brand?: ReactNode;
  /** Pinned to the bottom — usually the account block. */
  footer?: ReactNode;
  'aria-label'?: string;
  className?: string;
}

const ITEM_BASE =
  'group/item flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left ' +
  'font-sans text-sm cursor-pointer appearance-none border-0 bg-transparent no-underline ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-leaf';

const ITEM_IDLE = 'text-fg-muted hover:bg-surface-muted hover:text-fg';
const ITEM_ACTIVE = 'bg-accent-bg font-bold text-accent-fg';

/* Active is decided by the single deepest match across the whole tree — the leaf
 * of activeTrail — never a per-item path test. An index item like Overview
 * (`/admin`) is an ancestor of every `/admin/*` route, so a per-item test would
 * keep it lit on nested pages; the deepest-wins rule lights only the real leaf. */
function Leaf({ item, active, collapsed }: { item: SidebarItem; active: boolean; collapsed: boolean }) {
  const inner = (
    <>
      {item.icon ? <span className="flex shrink-0 items-center" aria-hidden="true">{item.icon}</span> : null}
      <span className={cn('min-w-0 flex-1 truncate', collapsed && 'sr-only')}>{item.label}</span>
      {item.badge != null && !collapsed ? (
        <span className="shrink-0 rounded-pill bg-surface-muted px-1.5 py-0.5 text-2xs font-bold text-fg-muted">
          {item.badge}
        </span>
      ) : null}
    </>
  );
  const cls = cn(ITEM_BASE, active ? ITEM_ACTIVE : ITEM_IDLE, collapsed && 'justify-center');
  const title = collapsed ? item.label : undefined;

  if (item.href) {
    return (
      <a href={item.href} onClick={item.onClick} className={cls} title={title} aria-current={active ? 'page' : undefined}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={item.onClick} className={cls} title={title} aria-current={active ? 'page' : undefined}>
      {inner}
    </button>
  );
}

function Group({
  item, activeId, onTrail, expanded, onToggle, collapsed, onExpandRail,
}: {
  item: SidebarItem;
  activeId: string | undefined;
  onTrail: boolean;
  expanded: boolean;
  onToggle: () => void;
  collapsed: boolean;
  onExpandRail: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        // In the rail there is nowhere to show children, so open the rail first.
        onClick={collapsed ? onExpandRail : onToggle}
        className={cn(ITEM_BASE, onTrail && !expanded ? ITEM_ACTIVE : ITEM_IDLE, collapsed && 'justify-center')}
        title={collapsed ? item.label : undefined}
        aria-expanded={collapsed ? undefined : expanded}
      >
        {item.icon ? <span className="flex shrink-0 items-center" aria-hidden="true">{item.icon}</span> : null}
        <span className={cn('min-w-0 flex-1 truncate', collapsed && 'sr-only')}>{item.label}</span>
        {!collapsed ? (
          <ChevronDown
            size={15}
            aria-hidden="true"
            className={cn('shrink-0 transition-transform duration-[var(--duration-fast)]', expanded && 'rotate-180')}
          />
        ) : null}
      </button>

      {expanded && !collapsed && item.children ? (
        <ul className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-border-subtle pl-3">
          {item.children.map((child) => (
            <li key={child.id}>
              <Leaf item={child} active={child.id === activeId} collapsed={false} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function Sidebar({
  sections, currentPath = '', collapsed = false, onCollapsedChange,
  brand, footer, 'aria-label': ariaLabel = 'Main', className,
}: SidebarProps) {
  // One global match: the deepest item that owns currentPath, and every group id
  // above it. Both the highlight and the auto-expand read from this.
  const trail = useMemo(() => activeTrail(sections.flatMap((s) => s.items), currentPath), [sections, currentPath]);
  const trailSet = useMemo(() => new Set(trail), [trail]);
  const activeId = trail[trail.length - 1];

  // Groups on the active branch open on load and whenever the route changes,
  // without collapsing groups the user opened by hand.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (trail.length) setExpanded((prev) => new Set([...prev, ...trail]));
  }, [trail]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'flex h-full flex-col border-r border-border-subtle bg-surface',
        collapsed ? 'w-16' : 'w-64',
        className,
      )}
    >
      {brand ? (
        <div className={cn('flex h-14 shrink-0 items-center border-b border-border-subtle px-3', collapsed && 'justify-center')}>
          {brand}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.id} className="mb-4 last:mb-0">
            {section.label && !collapsed ? (
              <h2 className="px-3 pb-1 text-2xs font-bold uppercase tracking-wide text-fg-muted">
                {section.label}
              </h2>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) =>
                item.children && item.children.length ? (
                  <Group
                    key={item.id}
                    item={item}
                    activeId={activeId}
                    onTrail={trailSet.has(item.id)}
                    collapsed={collapsed}
                    expanded={expanded.has(item.id)}
                    onToggle={() => toggle(item.id)}
                    onExpandRail={() => {
                      onCollapsedChange?.(false);
                      setExpanded((prev) => new Set([...prev, item.id]));
                    }}
                  />
                ) : (
                  <li key={item.id}>
                    <Leaf item={item} active={item.id === activeId} collapsed={collapsed} />
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>

      {footer ? (
        <div className={cn('shrink-0 border-t border-border-subtle p-2', collapsed && 'flex justify-center')}>
          {footer}
        </div>
      ) : null}

      {onCollapsedChange ? (
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={collapsed}
          className={cn(
            // Inset-shadow divider, not border-t: border-0 (the <button> reset,
            // preflight being off) and border-t are one tailwind-merge group.
            'flex h-10 shrink-0 items-center gap-3 px-3 text-fg-muted',
            'shadow-[inset_0_1px_0_var(--border-subtle)]',
            'cursor-pointer appearance-none border-0 bg-transparent',
            'hover:bg-surface-muted hover:text-fg',
            'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-leaf',
            collapsed ? 'justify-center' : 'justify-start',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose size={18} aria-hidden="true" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      ) : null}
    </nav>
  );
}
