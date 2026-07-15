import { describe, it, expect } from 'vitest';
import {
  rankedStaffRoles,
  rankedDepartments,
  staffTotal,
  approvalQueue,
  type StaffRole,
} from './adminhead';

describe('rankedStaffRoles', () => {
  it('puts the biggest role first — the bar chart reads as a ranking', () => {
    const rows: StaffRole[] = [
      { role: 'District Manager', count: 4 },
      { role: 'VCO', count: 11 },
      { role: 'Delivery Agent', count: 7 },
    ];
    expect(rankedStaffRoles(rows).map((r) => r.role)).toEqual([
      'VCO',
      'Delivery Agent',
      'District Manager',
    ]);
  });

  it('breaks a tie alphabetically, so a refresh cannot reshuffle equal roles', () => {
    const rows: StaffRole[] = [
      { role: 'Zonal Manager', count: 3 },
      { role: 'CFO', count: 3 },
      { role: 'Hub Incharge', count: 3 },
    ];
    // Without the tie-break these three would sit in whatever order PostgREST
    // happened to return, and the chart would appear to change on every refresh.
    expect(rankedStaffRoles(rows).map((r) => r.role)).toEqual([
      'CFO',
      'Hub Incharge',
      'Zonal Manager',
    ]);
  });

  it('labels a missing role rather than dropping the staff behind it', () => {
    const rows = [{ role: '', count: 2 }] as StaffRole[];
    expect(rankedStaffRoles(rows)).toEqual([{ role: 'Unassigned', count: 2 }]);
  });

  it('coerces a string count — PostgREST hands numerics back as strings', () => {
    const rows = [{ role: 'VCO', count: '9' }] as unknown as StaffRole[];
    expect(rankedStaffRoles(rows)[0].count).toBe(9);
  });

  it('does not mutate the input, and survives none', () => {
    const rows: StaffRole[] = [
      { role: 'A', count: 1 },
      { role: 'B', count: 5 },
    ];
    rankedStaffRoles(rows);
    expect(rows.map((r) => r.role)).toEqual(['A', 'B']);
    expect(rankedStaffRoles(undefined)).toEqual([]);
  });
});

describe('rankedDepartments', () => {
  it('ranks departments biggest first, tie-broken alphabetically', () => {
    const rows = [
      { dept: 'Operations', count: 2 },
      { dept: 'Finance', count: 6 },
      { dept: 'HR', count: 2 },
    ];
    expect(rankedDepartments(rows).map((r) => r.dept)).toEqual(['Finance', 'HR', 'Operations']);
  });

  it('survives none', () => {
    expect(rankedDepartments(null)).toEqual([]);
  });
});

describe('staffTotal', () => {
  it('sums the whole that the ranked bars are parts of', () => {
    expect(
      staffTotal([
        { role: 'VCO', count: 11 },
        { role: 'Delivery Agent', count: 7 },
      ]),
    ).toBe(18);
  });

  it('is 0, not NaN, when there is no staff', () => {
    expect(staffTotal(undefined)).toBe(0);
  });
});

describe('approvalQueue', () => {
  it('puts the longest queue first', () => {
    const q = approvalQueue({ employees_pending: 1, farmers_pending: 9, listings_pending: 4 });
    expect(q.map((i) => i.key)).toEqual(['farmers', 'listings', 'employees']);
  });

  it('keeps a zero queue on the list — "nothing waiting" is a real answer', () => {
    const q = approvalQueue({ employees_pending: 0, farmers_pending: 0, listings_pending: 0 });
    expect(q.map((i) => i.key).sort()).toEqual(['employees', 'farmers', 'listings']);
    expect(q.every((i) => i.count === 0)).toBe(true);
  });

  it('routes every queue to the screen that works it', () => {
    const q = approvalQueue({ employees_pending: 2, farmers_pending: 5, listings_pending: 3 });
    expect(q.find((i) => i.key === 'employees')!.to).toBe('/admin/employees');
    expect(q.find((i) => i.key === 'farmers')!.to).toBe('/admin/registrations');
    // Listings had NO door until /admin/listings was built — the count was shown
    // and the link withheld, because a link to a route that does not exist is a
    // worse lie than an admitted gap. The screen exists now.
    expect(q.find((i) => i.key === 'listings')!.to).toBe('/admin/listings');
  });

  it('treats a missing approvals block as an empty queue, not NaN counts', () => {
    expect(approvalQueue(undefined).every((i) => i.count === 0)).toBe(true);
  });
});
