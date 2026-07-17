import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, FilterChips, Spinner, Table, type TableColumn } from '@marutham/ui';
import { api, type Employee } from '@marutham/api-client';
import { fmtDateShort } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { EmployeeDetailSheet, EMP_APPROVAL_TONE } from './EmployeeDetailSheet';
import { EmployeeFormSheet } from './EmployeeFormSheet';
import { useTableLabels } from './useTableLabels';

const approvalOf = (e: Employee) => String(e.approval_status || 'pending');
const empName = (e: Employee) => `${e.fname || ''} ${e.lname || ''}`.trim();

export function EmployeesPage() {
  const { t, i18n } = useTranslation();
  const tableLabels = useTableLabels();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Removed staff are a SEPARATE set, not a filter on the list above — the server keeps
  // them out of every ordinary employee query, so they arrive on their own call.
  const [removed, setRemoved] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approval, setApproval] = useState('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  // null = form closed; { emp: null } = create; { emp } = edit.
  const [formMode, setFormMode] = useState<{ emp: Employee | null } | null>(null);
  // Authority mirrors the backend: Head Office / State Head by role, or anyone
  // carrying is_board_director / is_hr_admin. canApprove also gates create/edit
  // (canAccessTracker is the same set); canMintTrust (BoD flag / HR-owner) additionally
  // gates the trust-role checkboxes — an HR Admin may approve but not mint them.
  const [canApprove, setCanApprove] = useState(false);
  const [canMintTrust, setCanMintTrust] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [live, gone] = await Promise.all([
        api.getEmployees(),
        // Only HR-authorised callers can read the tracker at all, and this is the same
        // endpoint — but a failure here must not take the whole page down with it. The
        // removed list is secondary; the staff list is the page.
        api.getRemovedEmployees().catch(() => ({ employees: [] })),
      ]);
      setEmployees(live.employees || []);
      setRemoved(gone.employees || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load employees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const isHrOwner = user?.admin_role === 'Head Office' || user?.admin_role === 'State Head';
    if (isHrOwner) {
      setCanApprove(true);
      setCanMintTrust(true);
      return;
    }
    api
      .getMyEmployeeRecord()
      .then((res) => {
        const bod = !!res.employee?.is_board_director;
        setCanApprove(bod || !!res.employee?.is_hr_admin);
        setCanMintTrust(bod);
      })
      .catch(() => {
        setCanApprove(false);
        setCanMintTrust(false);
      });
  }, [user?.admin_role]);

  const approvalOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach((e) => {
      const s = approvalOf(e);
      counts[s] = (counts[s] || 0) + 1;
    });
    return [
      { value: 'pending', label: `${t('admin.emp.approval.pending')} (${counts.pending || 0})` },
      { value: 'approved', label: `${t('admin.emp.approval.approved')} (${counts.approved || 0})` },
      { value: 'rejected', label: `${t('admin.emp.approval.rejected')} (${counts.rejected || 0})` },
      // 'all' means all STAFF. Removed people are not staff, so they are not in it —
      // they get their own chip, which is the only route to a restore. It is shown even
      // at zero: hiding it would strand you on an empty selection the moment you restore
      // the last person, and it answers "where did they go?" for anyone looking.
      { value: 'all', label: `${t('admin.emp.all')} (${employees.length})` },
      { value: 'removed', label: `${t('admin.emp.removed')} (${removed.length})` },
    ];
  }, [employees, removed, t]);

  const viewingRemoved = approval === 'removed';

  const rows = useMemo(() => {
    if (viewingRemoved) return removed;
    if (approval === 'all') return employees;
    return employees.filter((e) => approvalOf(e) === approval);
  }, [employees, removed, approval, viewingRemoved]);

  const columns = useMemo<TableColumn<Employee>[]>(
    () => [
      {
        key: 'emp_id',
        header: t('admin.emp.empId'),
        value: (e) => e.emp_id || '',
        width: '130px',
        render: (e) =>
          e.emp_id ? (
            <span className="tabular-nums font-semibold text-fg">{e.emp_id}</span>
          ) : (
            <span className="text-2xs text-fg-muted">{t('admin.emp.notIssued')}</span>
          ),
      },
      {
        key: 'name',
        header: t('admin.emp.name'),
        value: (e) => empName(e),
        render: (e) => (
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-fg">{empName(e) || '—'}</span>
            {e.is_manager ? <Pill label={t('admin.emp.mgr')} bg="var(--info)" /> : null}
            {e.is_board_director ? (
              <Pill label={t('admin.emp.bod')} bg="var(--warning-strong)" />
            ) : null}
            {e.is_hr_admin ? <Pill label={t('admin.emp.hr')} bg="var(--info)" /> : null}
          </span>
        ),
      },
      {
        key: 'role',
        header: t('admin.emp.designation'),
        value: (e) => `${e.designation || ''}${e.department ? ' · ' + e.department : ''}`,
      },
      {
        key: 'workDistrict',
        header: t('admin.emp.workDistrict'),
        value: (e) => e.work_district || '',
      },
      {
        key: 'approval',
        header: t('admin.emp.approvalCol'),
        value: (e) => approvalOf(e),
        render: (e) => {
          const s = approvalOf(e);
          return (
            <span
              className="inline-block rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
              style={{ background: EMP_APPROVAL_TONE[s] || 'var(--fg-muted)' }}
            >
              {t('admin.emp.approval.' + s, s)}
            </span>
          );
        },
      },
      viewingRemoved
        ? {
            key: 'removedOn',
            header: t('admin.emp.removedOn'),
            value: (e) => e.deleted_at || '',
            render: (e) => fmtDateShort(e.deleted_at, i18n.language),
          }
        : {
            key: 'created',
            header: t('admin.emp.addedOn'),
            value: (e) => e.created_at || '',
            render: (e) => fmtDateShort(e.created_at, i18n.language),
          },
      {
        key: 'actions',
        header: '',
        sortable: false,
        exportable: false,
        render: (e) => (
          <button
            type="button"
            onClick={() => e.id && setOpenId(e.id)}
            className="cursor-pointer appearance-none rounded-sm border-0 bg-surface-muted px-2.5 py-1 text-2xs font-bold text-primary hover:bg-primary hover:text-primary-on focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
          >
            {viewingRemoved && canApprove
              ? t('admin.emp.restore')
              : approvalOf(e) === 'pending' && canApprove
                ? t('admin.emp.review')
                : t('admin.emp.view')}
          </button>
        ),
      },
    ],
    [t, canApprove, viewingRemoved],
  );

  if (loading && employees.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="🔒">{error}</EmptyState>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{t('admin.emp.title')}</h1>
        <div className="flex items-center gap-2">
          {canApprove ? (
            <Button onClick={() => setFormMode({ emp: null })}>+ {t('admin.emp.add')}</Button>
          ) : null}
          <Button variant="ghost" onClick={load} disabled={loading}>
            ↻ {t('admin.emp.refresh')}
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <FilterChips options={approvalOptions} value={approval} onChange={setApproval} />
      </div>

      <Table
        labels={tableLabels}
        rows={rows}
        columns={columns}
        rowId={(e) => e.id || e.emp_id || empName(e)}
        rowLabel={(e) => e.emp_id || empName(e)}
        caption={t('admin.emp.title')}
        searchable
        searchPlaceholder={t('admin.emp.search')}
        exportFileName={viewingRemoved ? 'employees-removed.csv' : 'employees.csv'}
        pageSize={25}
        empty={
          <EmptyState icon={viewingRemoved ? '🗂️' : '🧑‍💼'}>
            {viewingRemoved ? t('admin.emp.noRemoved') : t('admin.emp.empty')}
          </EmptyState>
        }
      />

      <EmployeeDetailSheet
        employeeId={openId}
        open={openId !== null}
        canApprove={canApprove}
        canManage={canApprove}
        selfEmpId={user?.emp_id}
        onClose={() => setOpenId(null)}
        onChanged={load}
        onEdit={(emp) => {
          setOpenId(null);
          setFormMode({ emp });
        }}
      />

      <EmployeeFormSheet
        employee={formMode?.emp ?? null}
        open={formMode !== null}
        canMintTrust={canMintTrust}
        onClose={() => setFormMode(null)}
        onSaved={load}
      />
    </>
  );
}

function Pill({ label, bg }: { label: string; bg: string }) {
  return (
    <span
      className="rounded-pill px-1.5 py-0.5 text-[9px] font-bold text-white"
      style={{ background: bg }}
    >
      {label}
    </span>
  );
}
