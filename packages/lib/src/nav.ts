/* Navigation logic for <Sidebar> in @marutham/ui — active-route matching, role
 * visibility, and the trail of groups to expand around the active item.
 *
 * Pure and DOM-free, the same split as table.ts / calendar.ts. It works on a
 * minimal `{ id, href?, roles?, children? }` shape, so the UI's richer item type
 * (icons, click handlers) satisfies it without the logic knowing about React. */

export interface NavNode {
  id: string;
  /** A route path. A group with no href is a pure container. */
  href?: string;
  /** admin_roles allowed to see this. Omitted or empty means everyone. */
  roles?: readonly string[];
  children?: readonly NavNode[];
}

/**
 * Does a nav href own the current path? Exact match, or an ancestor of it
 * (`/admin/orders` owns `/admin/orders/42`). The root `/` matches only itself —
 * otherwise it would light up on every page. Trailing slashes are ignored.
 */
export function matchPath(href: string | undefined, currentPath: string): boolean {
  if (!href) return false;
  const strip = (s: string) => (s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s);
  const h = strip(href);
  const p = strip(currentPath);
  if (h === '/') return p === '/';
  return p === h || p.startsWith(h + '/');
}

export function isRoleAllowed(
  roles: readonly string[] | undefined,
  role: string | null | undefined,
): boolean {
  if (!roles || roles.length === 0) return true;
  return role != null && roles.includes(role);
}

/**
 * Drop every node a role may not see, recursively. A container (no `href`) that
 * loses all its children is itself dropped — an empty group is not a menu entry.
 * A group that clears the role check but has an href survives even childless, so
 * a role-gated section that is also a link stays reachable.
 */
export function filterNavByRole<T extends NavNode>(
  items: readonly T[],
  role: string | null | undefined,
): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (!isRoleAllowed(item.roles, role)) continue;
    if (item.children && item.children.length) {
      const kids = filterNavByRole(item.children as readonly T[], role);
      if (kids.length === 0 && !item.href) continue; // empty container
      out.push({ ...item, children: kids });
    } else {
      out.push(item);
    }
  }
  return out;
}

/**
 * The ids from the root down to the item that owns `currentPath`, inclusive —
 * what the Sidebar expands so the active item is visible, and how it knows which
 * groups sit on the active branch.
 *
 * The winner is the item whose href is the **longest** prefix of `currentPath`,
 * i.e. the most specific match — not the deepest in the tree. Those differ: an
 * Overview at `/admin` and an Employees at `/admin/employees` are siblings, yet
 * on `/admin/employees/42` Employees must win because its path is more specific.
 * Ties (equal href length) keep the first in document order. Empty when nothing
 * matches.
 */
export function activeTrail(items: readonly NavNode[], currentPath: string): string[] {
  let best: string[] = [];
  let bestLen = -1;
  const walk = (nodes: readonly NavNode[], trail: string[]) => {
    for (const node of nodes) {
      const here = [...trail, node.id];
      if (matchPath(node.href, currentPath) && node.href!.length > bestLen) {
        bestLen = node.href!.length;
        best = here;
      }
      if (node.children) walk(node.children, here);
    }
  };
  walk(items, []);
  return best;
}
