import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { employeeDetailPairs, type EmployeeRecord } from '@marutham/lib';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../components/Toast';

export function ProfileSheet({
  open,
  onClose,
  isVCO,
}: {
  open: boolean;
  onClose: () => void;
  isVCO: boolean;
}) {
  const { t } = useTranslation();
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();

  const [gender, setGender] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [villages, setVillages] = useState<string[]>([]);
  const [villageInput, setVillageInput] = useState('');
  const [empPairs, setEmpPairs] = useState<[string, string][] | null>(null);
  const [cpw, setCpw] = useState('');
  const [npw, setNpw] = useState('');
  const [pwErr, setPwErr] = useState('');

  // Seed from the current user whenever the sheet opens.
  useEffect(() => {
    if (!open || !user) return;
    setGender((user.gender as string) || '');
    setVehicle((user.agent_vehicle as string) || '');
    setVillages(
      Array.isArray(user.service_villages) ? [...(user.service_villages as string[])] : [],
    );
    setVillageInput('');
    setCpw('');
    setNpw('');
    setPwErr('');
    let active = true;
    api
      .getMyEmployeeRecord()
      .then((res) => active && setEmpPairs(employeeDetailPairs(res.employee as EmployeeRecord)))
      .catch(() => active && setEmpPairs(null));
    return () => {
      active = false;
    };
  }, [open, user]);

  if (!user) return null;

  const name = user.fname + (user.lname ? ' ' + user.lname : '');

  async function patch(data: Record<string, unknown>, msg: string) {
    try {
      const res = await api.patchMe(data);
      updateUser(res.user);
      toast(msg, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'er');
    }
  }

  async function saveGender() {
    if (!gender) return toast('Please select a gender.', 'er');
    patch({ gender }, t('agent.profile.saved'));
  }

  function addVillage() {
    const v = villageInput.trim();
    if (v && !villages.some((x) => x.toLowerCase() === v.toLowerCase()))
      setVillages([...villages, v]);
    setVillageInput('');
  }

  async function changePw() {
    setPwErr('');
    if (!cpw) return setPwErr('Enter your current password.');
    if (npw.length < 6) return setPwErr('New password must be at least 6 characters.');
    try {
      await api.changePassword(cpw, npw);
      setCpw('');
      setNpw('');
      toast('Password changed.', 'ok');
    } catch (e) {
      setPwErr(e instanceof Error ? e.message : 'Failed to change password');
    }
  }

  return (
    <Sheet open={open} title={t('agent.profile')} onClose={onClose}>
      {/* Identity */}
      <div className="a-card">
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--forest)' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
          {(user.admin_role as string) || 'Delivery Agent'} · {(user.district as string) || '—'}
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="a-row">
            <span className="a-row__k">Login ID</span>
            <span className="a-row__v">{user.login_id}</span>
          </div>
          <div className="a-row">
            <span className="a-row__k">Phone</span>
            <span className="a-row__v">
              {(user.country_code as string) || '+91'} {user.phone}
            </span>
          </div>
          <div className="a-row">
            <span className="a-row__k">District</span>
            <span className="a-row__v">{(user.district as string) || '—'}</span>
          </div>
          <div className="a-row">
            <span className="a-row__k">Gender</span>
            <span className="a-row__v">{(user.gender as string) || '—'}</span>
          </div>
        </div>
      </div>

      {/* Employee master (read-only) */}
      {empPairs ? (
        <div className="a-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>
            🧑‍💼 Employee Details
          </div>
          <div style={{ fontSize: 10, color: 'var(--gray)', marginBottom: 10 }}>
            Maintained by Head Office · read-only
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {empPairs.map(([k, v]) => (
              <div className="a-row" key={k}>
                <span className="a-row__k">{k}</span>
                <span className="a-row__v">{v}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Gender */}
      <div className="a-card">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)', marginBottom: 10 }}>
          ⚧ {t('agent.profile.gender')}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select
            className="a-select"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            aria-label="Gender"
          >
            <option value="">— Select Gender —</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Transgender">Transgender</option>
          </select>
          <button className="a-btn-save" onClick={saveGender}>
            {t('agent.profile.save')}
          </button>
        </div>
      </div>

      {/* Vehicle */}
      <div className="a-card">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)', marginBottom: 10 }}>
          🛵 {t('agent.profile.vehicle')}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            className="a-input"
            type="text"
            placeholder="e.g. TN 38 AB 1234 — Bike"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            aria-label="Vehicle"
          />
          <button
            className="a-btn-save"
            onClick={() => patch({ agent_vehicle: vehicle.trim() }, t('agent.profile.saved'))}
          >
            {t('agent.profile.save')}
          </button>
        </div>
      </div>

      {/* Service villages — Delivery Agent only */}
      {!isVCO ? (
        <div className="a-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)', marginBottom: 4 }}>
            📍 {t('agent.profile.villages')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 10 }}>
            You'll be auto-suggested for orders in these villages — for collection and delivery.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {villages.length ? (
              villages.map((v, i) => (
                <span className="a-chip" key={v}>
                  {v}
                  <button
                    onClick={() => setVillages(villages.filter((_, j) => j !== i))}
                    aria-label={`Remove ${v}`}
                  >
                    ✕
                  </button>
                </span>
              ))
            ) : (
              <span style={{ fontSize: 12, color: 'var(--gray)' }}>No villages added yet.</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="a-input"
              type="text"
              placeholder="Add a village/town"
              value={villageInput}
              onChange={(e) => setVillageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addVillage();
                }
              }}
              aria-label="Add a village or town"
            />
            <button className="a-btn-save" onClick={addVillage}>
              Add
            </button>
          </div>
          <button
            className="a-btn-save"
            style={{ marginTop: 10, width: '100%' }}
            onClick={() => patch({ service_villages: villages }, 'Service villages saved.')}
          >
            Save Villages
          </button>
        </div>
      ) : null}

      {/* Change password */}
      <div className="a-card">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)', marginBottom: 10 }}>
          🔒 {t('agent.profile.changePassword')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="a-input"
            type="password"
            placeholder="Current password"
            value={cpw}
            onChange={(e) => setCpw(e.target.value)}
            autoComplete="current-password"
          />
          <input
            className="a-input"
            type="password"
            placeholder="New password (min 6 chars)"
            value={npw}
            onChange={(e) => setNpw(e.target.value)}
            autoComplete="new-password"
          />
          {pwErr ? <div style={{ fontSize: 11, color: 'var(--red)' }}>{pwErr}</div> : null}
          <button className="a-btn-save" style={{ width: '100%' }} onClick={changePw}>
            Update Password
          </button>
        </div>
      </div>

      <button
        onClick={logout}
        style={{
          background: 'var(--danger-bg)',
          color: 'var(--red)',
          border: '1px solid var(--danger-bg)',
          borderRadius: 12,
          padding: 13,
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          width: '100%',
        }}
      >
        {t('agent.profile.signOut')}
      </button>
    </Sheet>
  );
}
