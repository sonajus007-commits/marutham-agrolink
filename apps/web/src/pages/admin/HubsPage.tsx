import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, Button, Select, Spinner, EmptyState, type TableColumn } from '@marutham/ui';
import { api, type Hub } from '@marutham/api-client';
import { can } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useAdminGeo } from './AdminGeoContext';
import { useTableLabels } from './useTableLabels';
import { HubDetailSheet } from './HubDetailSheet';

/* Hub network management. Lists the district's main hub and its taluk hubs and
 * lets a manager (hub_management 'edit') set each hub's name, geo, active flag and
 * responsible Hub Incharge. Scoped by the console-wide district filter — the whole
 * ~1,700-hub network is never loaded at once. */
export function HubsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { state, district, districts, setDistrict } = useAdminGeo();
  const tableLabels = useTableLabels();
  const editable = can(user, 'hub_management', 'edit');

  // A geo-locked manager (District Manager and below) has no console district
  // filter and no district tree — they only ever manage their OWN district, so
  // fall back to it. Higher tiers pick via the console filter / the picker below.
  const effectiveDistrict = district || (user?.district as string) || '';

  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Hub | null>(null);

  const load = useCallback(() => {
    if (!effectiveDistrict) {
      setHubs([]);
      return;
    }
    setLoading(true);
    api
      .getHubs(effectiveDistrict, state)
      .then((res) => {
        setHubs(res.hubs || []);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load hubs'))
      .finally(() => setLoading(false));
  }, [effectiveDistrict, state]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = useMemo<TableColumn<Hub>[]>(
    () => [
      { key: 'name', header: t('admin.hubs.name', 'Hub name'), value: (h) => h.name },
      {
        key: 'type',
        header: t('admin.hubs.type', 'Type'),
        value: (h) =>
          h.hub_type === 'main'
            ? t('admin.hubs.mainHub', 'Main hub (district)')
            : t('admin.hubs.talukHub', 'Taluk hub'),
      },
      { key: 'taluk', header: t('address.taluk', 'Taluk'), value: (h) => h.taluk || '—' },
      {
        key: 'incharge',
        header: t('admin.hubs.incharge', 'Hub Incharge responsible'),
        value: (h) => h.incharge_name || t('admin.hubs.unassigned', 'Unassigned'),
      },
      {
        key: 'geo',
        header: t('admin.hubs.geo', 'Geo location'),
        sortable: false,
        exportable: false,
        value: (h) => (h.lat != null && h.lng != null ? `${h.lat}, ${h.lng}` : '—'),
      },
      {
        key: 'active',
        header: t('admin.hubs.active', 'Active'),
        value: (h) => (h.is_active === false ? 0 : 1),
        render: (h) => (
          <span
            className="inline-block rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
            style={{ background: h.is_active === false ? 'var(--gray)' : 'var(--forest)' }}
          >
            {h.is_active === false
              ? t('admin.hubs.inactive', 'Inactive')
              : t('admin.hubs.activeYes', 'Active')}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        sortable: false,
        exportable: false,
        render: (h) => (
          <Button variant="ghost" onClick={() => setOpen(h)}>
            {editable ? t('admin.hubs.edit', 'Edit') : t('admin.hubs.view', 'View')}
          </Button>
        ),
      },
    ],
    [t, editable],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-bold text-primary">{t('admin.nav.hubs', 'Hubs')}</h1>
        <p className="text-sm text-fg-muted">
          {t(
            'admin.hubs.subtitle',
            'The district’s main hub and its taluk hubs. Assign a Hub Incharge and set each hub’s location.',
          )}
        </p>
      </div>

      {!effectiveDistrict ? (
        <div className="flex flex-col items-start gap-2">
          <EmptyState icon="🏭">
            {t('admin.hubs.pickDistrict', 'Pick a district to see its hub network.')}
          </EmptyState>
          <Select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            aria-label={t('address.district', 'District')}
          >
            <option value="">{t('admin.hubs.pickDistrictShort', '— Select district —')}</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
      ) : loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="⚠️">{error}</EmptyState>
      ) : (
        <Table
          labels={tableLabels}
          rows={hubs}
          columns={columns}
          rowId={(h) => h.id}
          rowLabel={(h) => h.name}
          caption={t('admin.nav.hubs', 'Hubs')}
          searchable
          searchPlaceholder={t('admin.hubs.search', 'Search hubs')}
          exportFileName="hubs.csv"
          pageSize={25}
          empty={
            <EmptyState icon="🏭">{t('admin.hubs.empty', 'No hubs in this district.')}</EmptyState>
          }
        />
      )}

      <HubDetailSheet
        hub={open}
        open={open !== null}
        editable={editable}
        state={state}
        district={effectiveDistrict}
        onClose={() => setOpen(null)}
        onChanged={load}
      />
    </div>
  );
}
