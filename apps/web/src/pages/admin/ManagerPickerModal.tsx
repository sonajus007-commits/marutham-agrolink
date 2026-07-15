import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { INPUT_CLASS, Modal, Spinner } from '@marutham/ui';
import { api, type Employee } from '@marutham/api-client';

/** Picks a Reporting Manager, scoped by the org unit (Work District + Department). */
export function ManagerPickerModal({
  open,
  workDistrict,
  department,
  excludeId,
  onSelect,
  onClose,
}: {
  open: boolean;
  workDistrict: string;
  department: string;
  excludeId?: string;
  onSelect: (m: Employee) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [managers, setManagers] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setQ('');
    if (!workDistrict || !department) {
      setManagers([]);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getManagers({ district: workDistrict, department, exclude: excludeId })
      .then((res) => setManagers(res.managers || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load managers'))
      .finally(() => setLoading(false));
  }, [open, workDistrict, department, excludeId]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return managers;
    return managers.filter((m) =>
      [m.emp_id, m.fname, m.lname, m.designation]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [managers, q]);

  const missingUnit = !workDistrict || !department;

  return (
    <Modal
      open={open}
      title={`👔 ${t('admin.emp.mgrPicker')}`}
      subtitle={missingUnit ? undefined : `${workDistrict} · ${department}`}
      onClose={onClose}
    >
      {missingUnit ? (
        <p className="text-sm text-fg-muted">{t('admin.emp.mgrNeedUnit')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <input
            className={INPUT_CLASS}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('admin.emp.mgrSearch')}
          />
          {loading ? (
            <Spinner />
          ) : error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-3 text-center text-sm text-fg-muted">{t('admin.emp.mgrNone')}</p>
          ) : (
            <ul className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
              {rows.map((m) => (
                <li key={m.id || m.emp_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(m)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-base border border-border-subtle bg-surface p-2.5 text-left hover:border-leaf hover:bg-surface-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-fg">
                        {`${m.fname || ''} ${m.lname || ''}`.trim() || '—'}
                      </span>
                      <span className="block truncate text-2xs text-fg-muted">
                        {m.emp_id}
                        {m.designation ? ` · ${m.designation}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-2xs font-bold text-primary">
                      {t('admin.emp.mgrSelect')} →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
