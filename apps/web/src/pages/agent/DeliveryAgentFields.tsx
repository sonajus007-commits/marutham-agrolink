import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ServiceArea } from '@marutham/api-client';
import { getCurrentPosition } from '../../native/geolocation';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { OfficeHubCard } from '../../components/OfficeHubCard';

/** Today's date in IST as 'YYYY-MM-DD' — must match the server's istDateToday(). */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/* Delivery-Agent-only profile block: the daily "ready" switch, the read-only work
 * location (from the staff master), the taluk-grouped coverage editor, and the
 * hub the agent is responsible to. VCOs never see this (they have no delivery run).
 */
export function DeliveryAgentFields() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const toast = useToast();

  const district = (user?.district as string) || '';
  const state = (user?.state as string) || '';

  const [taluks, setTaluks] = useState<string[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [addTaluk, setAddTaluk] = useState('');
  const [villageInputs, setVillageInputs] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [savingReady, setSavingReady] = useState(false);

  // Seed the editable state from the current user (and after any save).
  useEffect(() => {
    if (!user) return;
    setAreas(
      Array.isArray(user.service_areas)
        ? (user.service_areas as ServiceArea[]).map((a) => ({
            taluk: a.taluk,
            villages: [...(a.villages || [])],
          }))
        : [],
    );
    setReady(user.available_date === istToday());
  }, [user]);

  // Taluks for the agent's district (cascaded from the locations tree) + the hubs.
  useEffect(() => {
    if (!district) return;
    let active = true;
    api
      .getLocations()
      .then((res) => {
        if (!active) return;
        const tree = res.tree || {};
        const forState = tree[state]?.[district];
        const scan = Object.values(tree)
          .map((d) => d[district])
          .find(Boolean);
        setTaluks(forState || scan || []);
      })
      .catch(() => active && setTaluks([]));
    return () => {
      active = false;
    };
  }, [district, state]);

  const coveredTaluks = useMemo(() => new Set(areas.map((a) => a.taluk)), [areas]);
  const addableTaluks = useMemo(
    () => taluks.filter((tk) => !coveredTaluks.has(tk)),
    [taluks, coveredTaluks],
  );

  async function patch(data: Record<string, unknown>, msg: string) {
    try {
      const res = await api.patchMe(data);
      updateUser(res.user);
      toast(msg, 'ok');
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : t('agent.profile.saveFailed', 'Save failed'), 'er');
      return false;
    }
  }

  async function toggleReady() {
    const next = !ready;
    setSavingReady(true);
    setReady(next); // optimistic
    const body: Record<string, unknown> = { available: next };
    if (next) {
      // Best-effort GPS — the agent can be ready even if location is declined.
      const pos = await getCurrentPosition();
      if (pos) {
        body.agent_lat = pos.lat;
        body.agent_lng = pos.lng;
      }
    }
    const ok = await patch(
      body,
      next
        ? t('agent.cover.readyOn', 'You are marked ready for delivery today.')
        : t('agent.cover.readyOff', 'You are marked off duty.'),
    );
    if (!ok) setReady(!next); // revert on failure
    setSavingReady(false);
  }

  function addArea() {
    const tk = addTaluk.trim();
    if (!tk || coveredTaluks.has(tk)) return;
    setAreas([...areas, { taluk: tk, villages: [] }]);
    setAddTaluk('');
  }

  function removeArea(taluk: string) {
    setAreas(areas.filter((a) => a.taluk !== taluk));
  }

  function addVillage(taluk: string) {
    const v = (villageInputs[taluk] || '').trim();
    if (!v) return;
    setAreas(
      areas.map((a) =>
        a.taluk === taluk && !a.villages.some((x) => x.toLowerCase() === v.toLowerCase())
          ? { ...a, villages: [...a.villages, v] }
          : a,
      ),
    );
    setVillageInputs({ ...villageInputs, [taluk]: '' });
  }

  function removeVillage(taluk: string, village: string) {
    setAreas(
      areas.map((a) =>
        a.taluk === taluk ? { ...a, villages: a.villages.filter((v) => v !== village) } : a,
      ),
    );
  }

  if (!user) return null;

  return (
    <>
      {/* Daily readiness — the field worker's one-tap action each morning. */}
      <div className="a-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>
              🚦 {t('agent.cover.readyTitle', 'Ready for delivery today')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
              {ready
                ? t('agent.cover.readyHintOn', 'VCOs and hubs can assign you orders today.')
                : t(
                    'agent.cover.readyHintOff',
                    'Turn on each day you are available. Clears overnight.',
                  )}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={ready}
            disabled={savingReady}
            onClick={toggleReady}
            aria-label={t('agent.cover.readyTitle', 'Ready for delivery today')}
            style={{
              width: 58,
              height: 32,
              borderRadius: 16,
              border: '1px solid var(--tint-300)',
              background: ready ? 'var(--forest)' : 'var(--surface-muted)',
              position: 'relative',
              cursor: savingReady ? 'wait' : 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: ready ? 29 : 3,
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'var(--white)',
                transition: 'left 0.15s',
              }}
            />
          </button>
        </div>
      </div>

      {/* Work location — read-only, from the staff master. */}
      <div className="a-card">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)', marginBottom: 10 }}>
          🗺️ {t('agent.cover.workArea', 'Work Area')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="a-row">
            <span className="a-row__k">{t('address.state', 'State')}</span>
            <span className="a-row__v">{state || '—'}</span>
          </div>
          <div className="a-row">
            <span className="a-row__k">{t('address.district', 'District')}</span>
            <span className="a-row__v">{district || '—'}</span>
          </div>
          <div className="a-row">
            <span className="a-row__k">{t('address.taluk', 'Taluk')}</span>
            <span className="a-row__v">{(user.taluk as string) || '—'}</span>
          </div>
          <div className="a-row">
            <span className="a-row__k">{t('address.city', 'City')}</span>
            <span className="a-row__v">{(user.city as string) || '—'}</span>
          </div>
        </div>
      </div>

      {/* Hub responsible — the taluk hub this agent belongs to. Assigned by admin/HR
          and shown read-only here (self-reassignment would defeat hub routing). */}
      <OfficeHubCard />

      {/* Areas I cover — villages typed under a taluk cascaded from the district. */}
      <div className="a-card">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)', marginBottom: 4 }}>
          📍 {t('agent.cover.areasTitle', 'Areas I cover')}
        </div>
        <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 10 }}>
          {t(
            'agent.cover.areasHint',
            'Pick a taluk in your district, then add the villages/towns you deliver to. You’ll be suggested for orders there.',
          )}
        </div>

        {/* Add a taluk */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <select
            className="a-select"
            value={addTaluk}
            onChange={(e) => setAddTaluk(e.target.value)}
            aria-label={t('agent.cover.addTaluk', 'Add a taluk')}
          >
            <option value="">{t('agent.cover.pickTaluk', '— Pick a taluk —')}</option>
            {addableTaluks.map((tk) => (
              <option key={tk} value={tk}>
                {tk}
              </option>
            ))}
          </select>
          <button className="a-btn-save" onClick={addArea} disabled={!addTaluk}>
            {t('consumer.addr.add', 'Add')}
          </button>
        </div>

        {areas.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>
            {t('agent.cover.noAreas', 'No areas added yet.')}
          </div>
        ) : (
          areas.map((a) => (
            <div
              key={a.taluk}
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                padding: 10,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>
                  {a.taluk}
                </span>
                <button
                  onClick={() => removeArea(a.taluk)}
                  aria-label={t('agent.cover.removeTaluk', 'Remove {{name}}', { name: a.taluk })}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: 'var(--red)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  ✕ {t('agent.cover.remove', 'Remove')}
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {a.villages.length ? (
                  a.villages.map((v) => (
                    <span className="a-chip" key={v}>
                      {v}
                      <button
                        onClick={() => removeVillage(a.taluk, v)}
                        aria-label={t('agent.profile.removeVillage', 'Remove {{name}}', {
                          name: v,
                        })}
                      >
                        ✕
                      </button>
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--gray)' }}>
                    {t('agent.cover.noVillages', 'No villages yet.')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="a-input"
                  type="text"
                  placeholder={t('agent.cover.addVillage', 'Add a village/town')}
                  value={villageInputs[a.taluk] || ''}
                  onChange={(e) =>
                    setVillageInputs({ ...villageInputs, [a.taluk]: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addVillage(a.taluk);
                    }
                  }}
                  aria-label={t('agent.cover.addVillageAria', 'Add a village or town to {{name}}', {
                    name: a.taluk,
                  })}
                />
                <button className="a-btn-save" onClick={() => addVillage(a.taluk)}>
                  {t('consumer.addr.add', 'Add')}
                </button>
              </div>
            </div>
          ))
        )}

        <button
          className="a-btn-save"
          style={{ width: '100%', marginTop: 4 }}
          onClick={() =>
            patch({ service_areas: areas }, t('agent.cover.areasSaved', 'Coverage saved.'))
          }
        >
          {t('agent.cover.saveAreas', 'Save Coverage')}
        </button>
      </div>
    </>
  );
}
