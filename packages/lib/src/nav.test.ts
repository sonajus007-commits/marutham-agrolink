import { describe, it, expect } from 'vitest';
import { matchPath, isRoleAllowed, filterNavByRole, activeTrail, type NavNode } from './nav';

describe('matchPath', () => {
  it('matches exactly and by ancestry', () => {
    expect(matchPath('/admin/orders', '/admin/orders')).toBe(true);
    expect(matchPath('/admin/orders', '/admin/orders/42')).toBe(true);
    expect(matchPath('/admin/orders', '/admin/ordering')).toBe(false); // not a path segment
    expect(matchPath('/admin/orders', '/admin')).toBe(false);
  });
  it('roots match only themselves', () => {
    expect(matchPath('/', '/')).toBe(true);
    expect(matchPath('/', '/anything')).toBe(false);
  });
  it('ignores trailing slashes', () => {
    expect(matchPath('/admin/', '/admin')).toBe(true);
    expect(matchPath('/admin', '/admin/')).toBe(true);
  });
  it('an undefined href never matches', () => {
    expect(matchPath(undefined, '/admin')).toBe(false);
  });
});

describe('isRoleAllowed', () => {
  it('open when no roles are declared', () => {
    expect(isRoleAllowed(undefined, 'Head Office')).toBe(true);
    expect(isRoleAllowed([], null)).toBe(true);
  });
  it('gated when roles are declared', () => {
    expect(isRoleAllowed(['Head Office'], 'Head Office')).toBe(true);
    expect(isRoleAllowed(['Head Office'], 'Hub Incharge')).toBe(false);
    expect(isRoleAllowed(['Head Office'], null)).toBe(false);
  });
});

describe('filterNavByRole', () => {
  const nav: NavNode[] = [
    { id: 'home', href: '/' },
    {
      id: 'ops',
      children: [
        { id: 'orders', href: '/orders' },
        { id: 'finance', href: '/finance', roles: ['Head Office', 'Board of Director'] },
      ],
    },
    { id: 'admin-only', href: '/admin', roles: ['Head Office'] },
  ];

  it('keeps open items and role-matching items', () => {
    const out = filterNavByRole(nav, 'Head Office');
    expect(out.map((i) => i.id)).toEqual(['home', 'ops', 'admin-only']);
    expect(out[1]!.children!.map((c) => c.id)).toEqual(['orders', 'finance']);
  });

  it('drops role-gated leaves for the wrong role', () => {
    const out = filterNavByRole(nav, 'Hub Incharge');
    expect(out.map((i) => i.id)).toEqual(['home', 'ops']); // admin-only gone
    expect(out[1]!.children!.map((c) => c.id)).toEqual(['orders']); // finance gone
  });

  it('drops a container that loses all its children', () => {
    const gated: NavNode[] = [
      { id: 'g', children: [{ id: 'x', href: '/x', roles: ['Head Office'] }] },
    ];
    expect(filterNavByRole(gated, 'Hub Incharge')).toEqual([]);
  });

  it('keeps a childless survivor that is itself a link', () => {
    const g: NavNode[] = [{ id: 'g', href: '/g', children: [{ id: 'x', href: '/x', roles: ['HO'] }] }];
    const out = filterNavByRole(g, 'other');
    expect(out.map((i) => i.id)).toEqual(['g']);
    expect(out[0]!.children).toEqual([]);
  });

  it('does not mutate the input', () => {
    const before = JSON.stringify(nav);
    filterNavByRole(nav, 'Hub Incharge');
    expect(JSON.stringify(nav)).toBe(before);
  });
});

describe('activeTrail', () => {
  const nav: NavNode[] = [
    { id: 'home', href: '/' },
    {
      id: 'ops',
      href: '/ops',
      children: [
        { id: 'orders', href: '/ops/orders' },
        { id: 'returns', href: '/ops/returns' },
      ],
    },
  ];

  it('returns the ids from root to the active leaf', () => {
    expect(activeTrail(nav, '/ops/orders')).toEqual(['ops', 'orders']);
    expect(activeTrail(nav, '/ops/orders/42')).toEqual(['ops', 'orders']);
  });

  it('prefers the deepest match when a parent also owns the path', () => {
    // '/ops' matches the parent; '/ops/orders' matches deeper — leaf wins.
    expect(activeTrail(nav, '/ops')).toEqual(['ops']);
    expect(activeTrail(nav, '/ops/orders')).toEqual(['ops', 'orders']);
  });

  it('matches the root exactly', () => {
    expect(activeTrail(nav, '/')).toEqual(['home']);
  });

  it('is empty when nothing matches', () => {
    expect(activeTrail(nav, '/nowhere')).toEqual([]);
  });

  it('prefers the most specific href among sibling ancestors', () => {
    // Overview (/admin) and Employees (/admin/employees) are both top-level and
    // both own /admin/employees/42; the longer href must win, not the first one.
    const siblings: NavNode[] = [
      { id: 'overview', href: '/admin' },
      { id: 'employees', href: '/admin/employees' },
    ];
    expect(activeTrail(siblings, '/admin/employees/42')).toEqual(['employees']);
    expect(activeTrail(siblings, '/admin')).toEqual(['overview']);
  });
});
