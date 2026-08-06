import { useTranslation } from 'react-i18next';
import { Select } from '@marutham/ui';
import { useAdminGeo } from './AdminGeoContext';

/* The shared State / District picker. Reads and writes the AdminGeoContext, so
 * every page that renders it shows — and drives — the one console-wide
 * selection. Renders nothing for a geo-locked role, whose view is already
 * scoped to their own district. */
export function AdminGeoFilter({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { canFilter, state, district, setState, setDistrict, states, districts } = useAdminGeo();

  if (!canFilter) return null;

  return (
    <div className={`flex flex-wrap items-end gap-3 ${className ?? ''}`}>
      <label className="flex flex-col gap-1 text-2xs font-bold uppercase tracking-wider text-fg-muted">
        {t('admin.overview.filter.state')}
        <Select value={state} onChange={(e) => setState(e.target.value)} className="min-w-[160px]">
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-2xs font-bold uppercase tracking-wider text-fg-muted">
        {t('admin.overview.filter.district')}
        <Select
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          className="min-w-[180px]"
        >
          <option value="">{t('admin.overview.filter.allDistricts')}</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
