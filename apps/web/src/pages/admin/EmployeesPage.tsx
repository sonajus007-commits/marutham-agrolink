import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, FilterChips, Spinner, Table, type TableColumn } from '@marutham/ui';
import { api, type Employee } from '@marutham/api-client';
import { fmtDateShort } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { EmployeeDetailSheet, EMP_APPROVAL_TONE } from './EmployeeDetailSheet';

const approvalOf = (e: Employee) => String(e.approval_status || 'pending');
const empName = (e: Employee) => `${e.fname || ''} ${e.lname || ''}`.trim();

export function EmployeesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approval, setApproval] = useState('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  // Approval authority mirrors the backend: Head Office / State Head by role, or
  // anyone carrying the is_board_director / is_hr_admin flag on their own record.
  const [canApprove, setCanApprove] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getEmployees();
      setEmployees(res.employees || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load employees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const isHrOwner = user?.admin_role === 'Head Office' || user?.admin_role === 'State Head';
    if (isHrOwner) { setCanApprove(true); return; }
    api.getMyEmployeeRecord()
      .then((res) => setCanApprove(!!res.employee?.is_board_director || !!res.employee?.is_hr_admin))
      .catch(() => setCanApprove(false));
  }, [user?.admin_role]);

  const approvalOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach((e) => { const s = approvalOf(e); counts[s] = (counts[s] || 0) + 1; });
    return [
      { value: 'pending', label: `${t('admin.emp.approval.pending')} (${counts.pending || 0})` },
      { value: 'approved', label: `${t('admin.emp.approval.approved')} (${counts.approved || 0})` },
      { value: 'rejected', label: `${t('admin.emp.approval.rejected')} (${counts.rejected || 0})` },
      { value: 'all', label: `${t('admin.emp.all')} (${employees.length})` },
    ];
  }, [employees, t]);

  const rows = useMemo(
    () => (approval === 'all' ? employees : employees.filter((e) => approvalOf(e) === approval)),
    [employees, approval],
  );

  const columns = useMemo<TableColumn<Employee>[]>(() => [
    {
      key: 'emp_id',
      header: t('admin.emp.empId'),
      value: (e) => e.emp_id || '',
      width: '130px',
      render: (e) => (e.emp_id ? <span className="tabular-nums font-semibold text-fg">{e.emp_id}</span> : <span className="text-2xs text-fg-muted">{t('admin.emp.notIssued')}</span>),
    },
    {
      key: 'name',
      header: t('admin.emp.name'),
      value: (e) => empName(e),
      render: (e) => (
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-fg">{empName(e) || '—'}</span>
          {e.is_manager ? <Pill label={t('admin.emp.mgr')} bg="var(--info)" /> : null}
          {e.is_board_director ? <Pill label={t('admin.emp.bod')} bg="var(--warning-strong)" /> : null}
          {e.is_hr_admin ? <Pill label={t('admin.emp.hr')} bg="var(--info)" /> : null}
        </span>
      ),
    },
    {
      key: 'role',
      header: t('admin.emp.designation'),
      value: (e) => `${e.designation || ''}${e.department ? ' · ' + e.department : ''}`,
    },
    { key: 'workDistrict', header: t('admin.emp.workDistrict'), value: (e) => e.work_district || '' },
    {
      key: 'approval',
      header: t('admin.emp.approvalCol'),
      value: (e) => approvalOf(e),
      render: (e) => {
        const s = approvalOf(e);
        return (
          <span className="inline-block rounded-pill px-2 py-0.5 text-2xs font-bold text-white" style={{ background: EMP_APPROVAL_TONE[s] || 'var(--fg-muted)' }}>
            {t('admin.emp.approval.' + s, s)}
          </span>
        );
      },
    },
    {
      key: 'created',
      header: t('admin.emp.addedOn'),
      value: (e) => e.created_at || '',
      render: (e) => fmtDateShort(e.created_at),
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
          {approvalOf(e) === 'pending' && canApprove ? t('admin.emp.review') : t('admin.emp.view')}
        </button>
      ),
    },
  ], [t, canApprove]);

  if (loading && employees.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="🔒">{error}</EmptyState>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{t('admin.emp.title')}</h1>
        <Button variant="ghost" onClick={load} disabled={loading}>↻ {t('admin.emp.refresh')}</Button>
      </div>

      <div className="mb-3">
        <FilterChips options={approvalOptions} value={approval} onChange={setApproval} />
      </div>

      <Table
        rows={rows}
        columns={columns}
        rowId={(e) => e.id || e.emp_id || empName(e)}
        rowLabel={(e) => e.emp_id || empName(e)}
        caption={t('admin.emp.title')}
        searchable
        searchPlaceholder={t('admin.emp.search')}
        exportFileName="employees.csv"
        pageSize={25}
        empty={<EmptyState icon="🧑‍💼">{t('admin.emp.empty')}</EmptyState>}
      />

      <EmployeeDetailSheet
        employeeId={openId}
        open={openId !== null}
        canApprove={canApprove}
        onClose={() => setOpenId(null)}
        onChanged={load}
      />
    </>
  );
}

function Pill({ label, bg }: { label: string; bg: string }) {
  return <span className="rounded-pill px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: bg }}>{label}</span>;
}
