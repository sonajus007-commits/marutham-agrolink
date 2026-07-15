import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useReturnFocus } from './lib/useReturnFocus';
import { cn } from './lib/cn';

/* The Admin / Executive console layout — the last piece of the shell. It puts
 * <Sidebar> and <Header> around the page and, below `lg`, turns the sidebar into
 * a slide-in drawer the Header's hamburger opens.
 *
 * AppShell owns the drawer's open state because two components must agree on it:
 * the Header raises it, the drawer consumes it. So `header` is a render function
 * handed `openNav` to wire onto the hamburger, while `sidebar` is a plain node
 * used in both places — the static column at `lg`+ and the drawer below it.
 *
 * The drawer is Radix Dialog, for the same reasons <Sheet> is: focus trap,
 * scroll lock, Escape, and an `inert` background. It has no Dialog.Trigger (the
 * hamburger lives in a portal-free Header and toggles state), so focus is
 * returned to the hamburger by hand via useReturnFocus. */

export interface AppShellProps {
  /** A <Sidebar>. Rendered as the static rail at `lg`+ and inside the drawer below. */
  sidebar: ReactNode;
  /** Usually `({ openNav }) => <Header onMenuClick={openNav} … />`; a plain node
   *  is allowed when there is no drawer to open. */
  header: ReactNode | ((ctx: { openNav: () => void }) => ReactNode);
  children: ReactNode;
  /** When it changes the drawer closes — i.e. a navigation dismisses it. */
  currentPath?: string;
  /** Names the drawer dialog for a screen reader. */
  navLabel?: string;
  className?: string;
}

export function AppShell({
  sidebar,
  header,
  children,
  currentPath,
  navLabel = 'Navigation',
  className,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const returnFocus = useReturnFocus(navOpen);

  // A navigation closes the drawer. Setting false when already false is a no-op,
  // so this is safe to fire on mount too.
  useEffect(() => {
    setNavOpen(false);
  }, [currentPath]);

  // Growing to the desktop breakpoint retires the drawer — the static rail is
  // back, and a drawer left open would float over it.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => mq.matches && setNavOpen(false);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const headerNode =
    typeof header === 'function' ? header({ openNav: () => setNavOpen(true) }) : header;

  return (
    <div className={cn('flex h-screen overflow-hidden bg-bg', className)}>
      {/* Static rail — desktop only. */}
      <div className="hidden h-full shrink-0 lg:block">{sidebar}</div>

      <div className="flex min-w-0 flex-1 flex-col">
        {headerNode}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      {/* Mobile drawer. lg:hidden is belt-and-suspenders with the resize effect. */}
      <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            className={cn(
              'fixed inset-0 z-[var(--z-overlay)] bg-[var(--overlay-scrim)] lg:hidden',
              'data-[state=open]:animate-scrim-in data-[state=closed]:animate-scrim-out motion-reduce:animate-none',
            )}
          />
          <Dialog.Content
            aria-label={navLabel}
            className={cn(
              'fixed inset-y-0 left-0 z-[var(--z-overlay)] w-64 max-w-[80vw] outline-none lg:hidden',
              'data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out motion-reduce:animate-none',
            )}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              returnFocus();
            }}
            // A link tap navigates; the drawer should not linger over the page it
            // just moved to. Group toggles are <button>s, so expanding a group
            // leaves the drawer open — only a real destination closes it.
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setNavOpen(false);
            }}
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">{navLabel}</Dialog.Title>
            {sidebar}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
