import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, Input, Select, Button, FIELD_LABEL_CLASS } from '@marutham/ui';
import { api, type Hub, type HubIncharge, type HubStaff } from '@marutham/api-client';
import { addressDetailRows, type SavedAddress } from '@marutham/lib';
import { useToast } from '../../components/Toast';
import { AddressFields } from '../../components/AddressFields';

/* Edit one hub: display name, the complete OFFICE ADDRESS (with its map pin),
 * active flag, and the responsible Hub Manager / Hub Incharge. state / district /
 * taluk are the hub's ROUTING KEYS — shown in the address block but locked, because
 * changing them would silently re-route the hub. Saving requires hub_management
 * 'edit' (server-enforced too); a view-only manager sees everything read-only. */
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
  // The full office address, including the routing keys (locked) and the map pin
  // (lat/lng carried on the address object, set via "Pin current location").
  const [addr, setAddr] = useState<SavedAddress>({});
  const [isActive, setIsActive] = useState(true);
  const [managerId, setManagerId] = useState('');
  const [managers, setManagers] = useState<HubStaff[]>([]);
  const [inchargeId, setInchargeId] = useState('');
  const [incharges, setIncharges] = useState<HubIncharge[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !hub) return;
    setName(hub.name || '');
    setAddr({
      house_no: hub.house_no || '',
      street1: hub.street1 || '',
      street2: hub.street2 || '',
      landmark: hub.landmark || '',
      village_town: hub.village_town || '',
      state: hub.state || '',
      district: hub.district || '',
      taluk: hub.taluk || '',
      country: hub.country || '',
      pincode: hub.pincode || '',
      lat: hub.lat ?? null,
      lng: hub.lng ?? null,
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

  async function save() {
    setSaving(true);
    try {
      const a = addr;
      await api.updateHub(hub!.id, {
        name: name.trim(),
        is_active: isActive,
        lat: typeof a.lat === 'number' ? a.lat : null,
        lng: typeof a.lng === 'number' ? a.lng : null,
        house_no: a.house_no?.trim() || null,
        street1: a.street1?.trim() || null,
        street2: a.street2?.trim() || null,
        landmark: a.landmark?.trim() || null,
        village_town: a.village_town?.trim() || null,
        country: a.country?.trim() || null,
        pincode: a.pincode?.trim() || null,
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
        {/* Read-only structure. state/district/taluk also appear (locked) in the
            address block below; only the hub Type is shown here. */}
        <div className="rounded-lg border border-border-subtle p-3 text-sm">
          <Row k={t('admin.hubs.type', 'Type')} v={typeLabel} />
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

        {/* Office address — the full block. State / District / Taluk are the hub's
            routing keys, shown but locked. The pin marks the hub → consumer delivery
            origin; if you don't pin it, the server geocodes the address on save. */}
        <div className="flex flex-col gap-3 rounded-lg border border-border-subtle p-3">
          <span className={FIELD_LABEL_CLASS}>
            {t('admin.hubs.officeAddress', 'Office address')}
          </span>
          {editable ? (
            <AddressFields
              value={addr}
              onChange={setAddr}
              showStreet2
              showPin
              locked={{ state: true, district: true, taluk: true }}
            />
          ) : (
            addressDetailRows(addr).map(([key, label, value]) => (
              <div key={key} className="flex justify-between gap-3 py-0.5 text-sm">
                <span className="text-fg-muted">{t(key, label)}</span>
                <span className="text-right font-medium">{value}</span>
              </div>
            ))
          )}
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
