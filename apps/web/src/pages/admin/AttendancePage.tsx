import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState, Spinner, StatTile, FIELD_LABEL_CLASS } from '@marutham/ui';
import { api, type AttendanceRow } from '@marutham/api-client';
import { fmtDate } from '@marutham/lib';
import { useAdminGeo } from './AdminGeoContext';
import { AdminGeoFilter } from './AdminGeoFilter';

/* Field-team attendance (A5, migration 057). Who is on duty today — the roster the
 * dashboards' vco_attendance / agents_online placeholders stood in for. Gated on
 * attendance:view; the manager geo filter scopes it to their area. */

export function AttendancePage() {
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState(() =>
    new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10),
  );
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAttendance({ date });
      setRows(res.attendance || []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('admin.att.loadFailed', 'Could not load attendance'),
      );
    } finally {
      setLoading(false);
    }
  }, [date, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const { inGeoScope } = useAdminGeo();
  const scoped = rows.filter((r) => inGeoScope(r.district || ''));
  const scopedOnDuty = scoped.filter((r) => r.status === 'on_duty').length;

  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-primary">
        🧑‍🌾 {t('admin.att.title', 'Field Team')}
      </h1>
      <p className="mb-4 text-2xs text-fg-muted">
        {t('admin.att.sub', 'Who is on duty in the field — VCOs, delivery agents and hub staff.')}
      </p>

      <AdminGeoFilter className="mb-4" />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label style={{ maxWidth: 200 }}>
          <span className={FIELD_LABEL_CLASS}>{t('admin.att.date', 'Date')}</span>
          <input
            type="date"
            aria-label={t('admin.att.date', 'Date')}
            style={{ width: '100%', padding: '8px 10px' }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="grid flex-1 grid-cols-2 gap-3" style={{ minWidth: 220 }}>
          <StatTile
            label={t('admin.att.onDuty', 'On duty')}
            value={String(scopedOnDuty)}
            tone="green"
          />
          <StatTile
            label={t('admin.att.checkedIn', 'Checked in')}
            value={String(scoped.length)}
            tone="green"
          />
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="⚠️">{error}</EmptyState>
      ) : scoped.length === 0 ? (
        <EmptyState icon="🧑‍🌾">
          {t('admin.att.empty', 'No field staff checked in for this date.')}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {scoped.map((r) => (
            <Card key={r.user_id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-fg">{r.name || r.user_id.slice(0, 8)}</div>
                  <div className="mt-0.5 text-2xs text-fg-muted">
                    {r.role}
                    {r.district ? ` · ${r.district}` : ''}
                    {r.phone ? ` · ${r.phone}` : ''}
                  </div>
                  <div className="mt-1 text-2xs text-fg-muted">
                    {t('admin.att.in', 'In')}:{' '}
                    {r.checked_in_at ? fmtDate(r.checked_in_at, i18n.language) : '—'}
                    {r.checked_out_at
                      ? ` · ${t('admin.att.out', 'Out')}: ${fmtDate(r.checked_out_at, i18n.language)}`
                      : ''}
                  </div>
                </div>
                <span
                  className="shrink-0 text-2xs font-bold uppercase"
                  style={{ color: r.status === 'on_duty' ? 'var(--green)' : 'var(--gray)' }}
                >
                  {r.status === 'on_duty'
                    ? t('admin.att.on', 'On duty')
                    : t('admin.att.off', 'Off duty')}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
