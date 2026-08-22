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

/* Hub network management. Lists a district's main hub and its taluk hubs and lets a
 * manager (hub_management 'edit') set each hub's name, geo, active flag and
 * responsible Hub Manager / Incharge. The view is drilled by District (the
 * console-wide filter) and then by Taluk (a page-local filter). CREATING a hub is
 * Admin-only (hub_management 'create') and takes State + District + Taluk, so the
 * Admin team can stand up a hub anywhere, not only in the console's district. */
export function HubsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const { state, district, districts, setDistrict, canFilter } = useAdminGeo();
  const { states, districtsOf, taluksOf } = useLocations();
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

  // Page-local Taluk filter (narrows the loaded district's hubs).
  const [talukFilter, setTalukFilter] = useState('');

  // Create-hub sheet — Admin picks State → District → Taluk and names the hub. A
  // taluk can hold several hubs (offices), so the taluk is never "taken"; the NAME
  // is what must be unique within the taluk (validated on save).
  const [creating, setCreating] = useState(false);
  const [newState, setNewState] = useState('');
  const [newDistrict, setNewDistrict] = useState('');
  const [newTaluk, setNewTaluk] = useState('');
  const [newName, setNewName] = useState('');
  const [savingNew, setSavingNew] = useState(false);

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

  // The taluks present in the loaded district, for the page-local filter.
  const talukOptions = useMemo(
    () =>
      [...new Set(hubs.map((h) => h.taluk).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [hubs],
  );

  // A district change (or a fresh load) can strand a taluk filter — drop it.
  useEffect(() => {
    if (talukFilter && !talukOptions.includes(talukFilter)) setTalukFilter('');
  }, [talukOptions, talukFilter]);

  const visibleHubs = useMemo(
    () => (talukFilter ? hubs.filter((h) => h.taluk === talukFilter) : hubs),
    [hubs, talukFilter],
  );

  // Every taluk in the chosen create-district — all selectable (a taluk can hold
  // several hubs).
  const createTaluks = useMemo(
    () => taluksOf(newState, newDistrict),
    [taluksOf, newState, newDistrict],
  );

  function openCreate() {
    // Seed from the console selection so the common case is one click, but every
    // field stays editable — the Admin team can create a hub in any state/district.
    setNewState(state || '');
    setNewDistrict(effectiveDistrict || '');
    setNewTaluk('');
    setNewName('');
    setCreating(true);
  }

  async function createHub() {
    const name = newName.trim();
    if (!newState || !newDistrict || !newTaluk || !name) return;
    setSavingNew(true);
    try {
      await api.createHub({
        state: newState,
        district: newDistrict,
        taluk: newTaluk,
        name,
      });
      toast(t('admin.hubs.created', 'Hub created.'), 'ok');
      setCreating(false);
      // If the new hub landed in the district on screen, reflect it.
      if (newDistrict === effectiveDistrict) load();
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
        {canCreate ? (
          <Button onClick={openCreate}>+ {t('admin.hubs.create', 'Create hub')}</Button>
        ) : null}
      </div>

      {/* Drill the view by District (console filter) then Taluk (page-local). */}
      <div className="flex flex-wrap items-end gap-3">
        {canFilter ? (
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{t('address.district', 'District')}</span>
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
          </label>
        ) : null}
        {effectiveDistrict ? (
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{t('address.taluk', 'Taluk')}</span>
            <Select
              value={talukFilter}
              onChange={(e) => setTalukFilter(e.target.value)}
              aria-label={t('address.taluk', 'Taluk')}
              disabled={talukOptions.length === 0}
            >
              <option value="">{t('admin.hubs.allTaluks', 'All taluks')}</option>
              {talukOptions.map((tk) => (
                <option key={tk} value={tk}>
                  {tk}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>

      {!effectiveDistrict ? (
        <EmptyState icon="🏭">
          {t('admin.hubs.pickDistrict', 'Pick a district to see its hub network.')}
        </EmptyState>
      ) : loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="⚠️">{error}</EmptyState>
      ) : (
        <Table
          labels={tableLabels}
          rows={visibleHubs}
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
              'admin.hubs.createHintGeo',
              'Pick the State, District and Taluk this hub serves, then give it a name. A taluk can have several hubs — each name must be unique within the taluk (e.g. Hub 1, Hub 2).',
            )}
          </p>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{t('address.state', 'State')}</span>
            <Select
              value={newState}
              onChange={(e) => {
                setNewState(e.target.value);
                setNewDistrict('');
                setNewTaluk('');
              }}
            >
              <option value="">{t('admin.hubs.pickState', '— Select a state —')}</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{t('address.district', 'District')}</span>
            <Select
              value={newDistrict}
              onChange={(e) => {
                setNewDistrict(e.target.value);
                setNewTaluk('');
              }}
              disabled={!newState}
            >
              <option value="">{t('admin.hubs.pickDistrictShort', '— Select district —')}</option>
              {districtsOf(newState).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{t('address.taluk', 'Taluk')}</span>
            <Select
              value={newTaluk}
              onChange={(e) => setNewTaluk(e.target.value)}
              disabled={!newDistrict}
            >
              <option value="">{t('admin.hubs.pickTaluk', '— Select a taluk —')}</option>
              {createTaluks.map((tk) => (
                <option key={tk} value={tk}>
                  {tk}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{t('admin.hubs.nameLabel', 'Hub name')}</span>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={newTaluk ? `${newTaluk} Hub 1` : t('admin.hubs.name', 'Hub name')}
            />
          </label>

          <div className="flex gap-2">
            <Button
              onClick={createHub}
              disabled={savingNew || !newState || !newDistrict || !newTaluk || !newName.trim()}
            >
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
