import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, Input, Select, Button, FIELD_LABEL_CLASS } from '@marutham/ui';
import { api, type Hub, type HubIncharge, type HubStaff } from '@marutham/api-client';
import { getCurrentPosition } from '../../native/geolocation';
import { useToast } from '../../components/Toast';

/* Edit one hub: display name, geo coordinates, active flag, and the Hub Incharge
 * responsible for it. Structure (hub_type / district / parent) is seeded and shown
 * read-only. Saving requires hub_management 'edit' (the server enforces it too);
 * a view-only manager gets the fields disabled. */
export function HubDetailSheet({
  hub,
  open,
  editable,
  state,
  district,
  onClose,
  onChanged,
}: {
  hub: Hub | null;
  open: boolean;
  editable: boolean;
  state: string;
  district: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();

  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  // Office address (free text). state/district/taluk are the hub's routing keys and
  // stay read-only in the structural block above — editing them here would silently
  // re-route the hub.
  const [addr, setAddr] = useState({
    house_no: '',
    street1: '',
    street2: '',
    landmark: '',
    village_town: '',
    country: '',
    pincode: '',
  });
  const [isActive, setIsActive] = useState(true);
  const [managerId, setManagerId] = useState('');
  const [managers, setManagers] = useState<HubStaff[]>([]);
  const [inchargeId, setInchargeId] = useState('');
  const [incharges, setIncharges] = useState<HubIncharge[]>([]);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!open || !hub) return;
    setName(hub.name || '');
    setLat(hub.lat != null ? String(hub.lat) : '');
    setLng(hub.lng != null ? String(hub.lng) : '');
    setAddr({
      house_no: hub.house_no || '',
      street1: hub.street1 || '',
      street2: hub.street2 || '',
      landmark: hub.landmark || '',
      village_town: hub.village_town || '',
      country: hub.country || '',
      pincode: hub.pincode || '',
    });
    setIsActive(hub.is_active !== false);
    setManagerId(hub.hub_manager_id || '');
    setInchargeId(hub.hub_incharge_id || '');
    const role = hub.hub_type === 'main' ? 'District Manager' : 'Hub Manager';
    let active = true;
    api
      .getHubStaff(role, district, state)
      .then((res) => active && setManagers(res.staff || []))
      .catch(() => active && setManagers([]));
    // A main hub has no separate Hub Incharge layer; only taluk hubs do.
    if (hub.hub_type === 'taluk') {
      api
        .getHubIncharges(district, state)
        .then((res) => active && setIncharges(res.incharges || []))
        .catch(() => active && setIncharges([]));
    } else {
      setIncharges([]);
    }
    return () => {
      active = false;
    };
  }, [open, hub, district, state]);

  if (!hub) return null;

  async function useCurrentLocation() {
    setLocating(true);
    const pos = await getCurrentPosition();
    setLocating(false);
    if (!pos) {
      toast(t('admin.hubs.locFailed', 'Could not read your location.'), 'er');
      return;
    }
    setLat(pos.lat.toFixed(6));
    setLng(pos.lng.toFixed(6));
  }

  async function save() {
    setSaving(true);
    try {
      await api.updateHub(hub!.id, {
        name: name.trim(),
        is_active: isActive,
        lat: lat.trim() === '' ? null : Number(lat),
        lng: lng.trim() === '' ? null : Number(lng),
        house_no: addr.house_no.trim() || null,
        street1: addr.street1.trim() || null,
        street2: addr.street2.trim() || null,
        landmark: addr.landmark.trim() || null,
        village_town: addr.village_town.trim() || null,
        country: addr.country.trim() || null,
        pincode: addr.pincode.trim() || null,
        hub_manager_id: managerId || null,
        // Only taluk hubs carry a Hub Incharge; don't send it for a main hub.
        ...(hub!.hub_type === 'taluk' ? { hub_incharge_id: inchargeId || null } : {}),
      });
      toast(t('admin.hubs.saved', 'Hub updated.'), 'ok');
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('admin.hubs.saveFailed', 'Save failed'), 'er');
    } finally {
      setSaving(false);
    }
  }

  const typeLabel =
    hub.hub_type === 'main'
      ? t('admin.hubs.mainHub', 'Main hub (district)')
      : t('admin.hubs.talukHub', 'Taluk hub');

  return (
    <Sheet open={open} title={hub.name} onClose={onClose}>
      <div className="flex flex-col gap-4 p-1">
        {/* Read-only structure */}
        <div className="rounded-lg border border-border-subtle p-3 text-sm">
          <Row k={t('admin.hubs.type', 'Type')} v={typeLabel} />
          <Row k={t('address.district', 'District')} v={hub.district} />
          {hub.taluk ? <Row k={t('address.taluk', 'Taluk')} v={hub.taluk} /> : null}
        </div>

        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL_CLASS}>{t('admin.hubs.name', 'Hub name')}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} />
        </label>

        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL_CLASS}>
            {hub.hub_type === 'main'
              ? t('admin.hubs.districtManager', 'District Manager responsible')
              : t('admin.hubs.manager', 'Hub Manager responsible')}
          </span>
          <Select
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            disabled={!editable}
          >
            <option value="">{t('admin.hubs.noManager', '— Unassigned —')}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.login_id})
              </option>
            ))}
          </Select>
        </label>

        {/* A taluk hub also has a Hub Incharge (a reportee under the Hub Manager). */}
        {hub.hub_type === 'taluk' ? (
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>
              {t('admin.hubs.incharge', 'Hub Incharge responsible')}
            </span>
            <Select
              value={inchargeId}
              onChange={(e) => setInchargeId(e.target.value)}
              disabled={!editable}
            >
              <option value="">{t('admin.hubs.noIncharge', '— Unassigned —')}</option>
              {incharges.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.login_id})
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{t('admin.hubs.lat', 'Latitude')}</span>
            <Input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              placeholder="—"
              disabled={!editable}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{t('admin.hubs.lng', 'Longitude')}</span>
            <Input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              placeholder="—"
              disabled={!editable}
            />
          </label>
        </div>
        {editable ? (
          <Button variant="ghost" onClick={useCurrentLocation} disabled={locating}>
            {locating
              ? t('admin.hubs.locating', 'Getting location…')
              : t('admin.hubs.useLocation', '📍 Use my current location')}
          </Button>
        ) : null}

        {/* Office address — the postal address shown to every VCO / Delivery Agent /
            Hub Incharge / Hub Manager assigned to this hub. */}
        <div className="flex flex-col gap-3 rounded-lg border border-border-subtle p-3">
          <span className={FIELD_LABEL_CLASS}>
            {t('admin.hubs.officeAddress', 'Office address')}
          </span>
          {(
            [
              ['house_no', t('address.houseNo', 'House / Flat No.')],
              ['street1', t('address.street1', 'Street Line 1')],
              ['street2', t('address.street2', 'Street Line 2')],
              ['landmark', t('address.landmark', 'Landmark')],
              ['village_town', t('address.village', 'Village / Town / City')],
              ['country', t('address.country', 'Country')],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className={FIELD_LABEL_CLASS}>{label}</span>
              <Input
                value={addr[key]}
                onChange={(e) => setAddr((a) => ({ ...a, [key]: e.target.value }))}
                disabled={!editable}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{t('address.pincode', 'Pincode')}</span>
            <Input
              value={addr.pincode}
              inputMode="numeric"
              onChange={(e) =>
                setAddr((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))
              }
              disabled={!editable}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={!editable}
            aria-label={t('admin.hubs.active', 'Active')}
          />
          {t('admin.hubs.active', 'Active')}
        </label>

        {editable ? (
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving ? t('admin.hubs.saving', 'Saving…') : t('admin.hubs.save', 'Save hub')}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-fg-muted">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
