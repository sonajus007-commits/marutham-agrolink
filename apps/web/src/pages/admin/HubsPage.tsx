import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  Button,
  Select,
  Input,
  Sheet,
  Spinner,
  EmptyState,
  FIELD_LABEL_CLASS,
  type TableColumn,
} from '@marutham/ui';
import { api, type Hub } from '@marutham/api-client';
import { can } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useLocations } from '../../hooks/useLocations';
import { useToast } from '../../components/Toast';
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
  const toast = useToast();
  const { state, district, districts, setDistrict } = useAdminGeo();
  const { taluksOf } = useLocations();
  const tableLabels = useTableLabels();
  const editable = can(user, 'hub_management', 'edit');
  const canCreate = can(user, 'hub_management', 'create');

  // A geo-locked manager (District Manager and below) has no console district
  // filter and no district tree — they only ever manage their OWN district, so
  // fall back to it. Higher tiers pick via the console filter / the picker below.
  const effectiveDistrict = district || (user?.district as string) || '';

  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Hub | null>(null);

  // Create-hub sheet (admin picks a taluk that has no hub yet).
  const [creating, setCreating] = useState(false);
  const [newTaluk, setNewTaluk] = useState('');
  const [newName, setNewName] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  // Taluks in this district that don't already have a hub — the only ones a new
  // hub can be created for (one taluk hub per taluk).
  const takenTaluks = useMemo(
    () => new Set(hubs.map((h) => h.taluk).filter(Boolean) as string[]),
    [hubs],
  );
  const availableTaluks = useMemo(
    () => taluksOf(state, effectiveDistrict).filter((tk) => !takenTaluks.has(tk)),
    [taluksOf, state, effectiveDistrict, takenTaluks],
  );

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

  function openCreate() {
    setNewTaluk('');
    setNewName('');
    setCreating(true);
  }

  async function createHub() {
    if (!newTaluk) return;
    setSavingNew(true);
    try {
      await api.createHub({
        state,
        district: effectiveDistrict,
        taluk: newTaluk,
        name: newName.trim() || undefined,
      });
      toast(t('admin.hubs.created', 'Hub created.'), 'ok');
      setCreating(false);
      load();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('admin.hubs.createFailed', 'Could not create hub'),
        'er',
      );
    } finally {
      setSavingNew(false);
    }
  }

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
        key: 'manager',
        header: t('admin.hubs.managerCol', 'Manager'),
        value: (h) => h.manager_name || t('admin.hubs.unassigned', 'Unassigned'),
      },
      {
        key: 'incharge',
        header: t('admin.hubs.incharge', 'Hub Incharge responsible'),
        value: (h) =>
          h.hub_type === 'main' ? '—' : h.incharge_name || t('admin.hubs.unassigned', 'Unassigned'),
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-primary">{t('admin.nav.hubs', 'Hubs')}</h1>
          <p className="text-sm text-fg-muted">
            {t(
              'admin.hubs.subtitle',
              'The district’s main hub and its taluk hubs. Assign a Hub Manager and set each hub’s location.',
            )}
          </p>
        </div>
        {canCreate && effectiveDistrict ? (
          <Button onClick={openCreate}>+ {t('admin.hubs.create', 'Create hub')}</Button>
        ) : null}
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

      <Sheet
        open={creating}
        title={t('admin.hubs.createTitle', 'Create a taluk hub')}
        onClose={() => setCreating(false)}
      >
        <div className="flex flex-col gap-4 p-1">
          <p className="text-sm text-fg-muted">
            {t(
              'admin.hubs.createHint',
              'Create a hub for a taluk in {{district}}. Only taluks without a hub are listed.',
              { district: effectiveDistrict },
            )}
          </p>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{t('address.taluk', 'Taluk')}</span>
            <Select value={newTaluk} onChange={(e) => setNewTaluk(e.target.value)}>
              <option value="">{t('admin.hubs.pickTaluk', '— Select a taluk —')}</option>
              {availableTaluks.map((tk) => (
                <option key={tk} value={tk}>
                  {tk}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>
              {t('admin.hubs.nameOptional', 'Hub name (optional)')}
            </span>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={newTaluk ? `${newTaluk} Hub` : t('admin.hubs.name', 'Hub name')}
            />
          </label>

          {availableTaluks.length === 0 ? (
            <p className="text-2xs text-fg-muted">
              {t('admin.hubs.allTaluksHaveHubs', 'Every taluk in this district already has a hub.')}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button onClick={createHub} disabled={savingNew || !newTaluk}>
              {savingNew
                ? t('admin.hubs.creating', 'Creating…')
                : t('admin.hubs.create', 'Create hub')}
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
