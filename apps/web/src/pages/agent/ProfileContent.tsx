import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@marutham/api-client';
import { employeeDetailPairs, type EmployeeDetailPair, type EmployeeRecord } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';

/* The field-staff profile body — the same cards whether shown as the Profile
 * PAGE (sidebar/tab) or inside the legacy ProfileSheet. Seeds from the current
 * user on mount (and whenever the user record changes after a save), so it needs
 * no `open` signal to reset — a page is simply mounted while it is the active
 * tab. VCO and Delivery Agent share it; `isVCO` hides Delivery-only sections. */
export function ProfileContent({ isVCO }: { isVCO: boolean }) {
  const { t, i18n } = useTranslation();
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();

  const [gender, setGender] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [villages, setVillages] = useState<string[]>([]);
  const [villageInput, setVillageInput] = useState('');
  const [empPairs, setEmpPairs] = useState<EmployeeDetailPair[] | null>(null);
  const [cpw, setCpw] = useState('');
  const [npw, setNpw] = useState('');
  const [pwErr, setPwErr] = useState('');

  // Seed from the current user on mount and whenever the user record changes.
  useEffect(() => {
    if (!user) return;
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
      .then(
        (res) =>
          active && setEmpPairs(employeeDetailPairs(res.employee as EmployeeRecord, i18n.language)),
      )
      .catch(() => active && setEmpPairs(null));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  const name = user.fname + (user.lname ? ' ' + user.lname : '');

  async function patch(data: Record<string, unknown>, msg: string) {
    try {
      const res = await api.patchMe(data);
      updateUser(res.user);
      toast(msg, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : t('agent.profile.saveFailed', 'Save failed'), 'er');
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
    if (!cpw) return setPwErr(t('pwd.needCurrent', 'Enter your current password.'));
    if (npw.length < 6)
      return setPwErr(t('agent.profile.pwShort', 'New password must be at least 6 characters.'));
    try {
      await api.changePassword(cpw, npw);
      setCpw('');
      setNpw('');
      toast('Password changed.', 'ok');
    } catch (e) {
      setPwErr(e instanceof Error ? e.message : t('pwd.failed', 'Could not change password'));
    }
  }

  return (
    <>
      {/* Identity */}
      <div className="a-card">
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--forest)' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
          {/* admin_role is the API's value; the agent page serves two roles, and
              anything else renders as whatever the API called it. */}
          {t(
            `agent.role.${String(user.admin_role || '') === 'VCO' ? 'vco' : 'deliveryAgent'}`,
            (user.admin_role as string) || 'Delivery Agent',
          )}{' '}
          · {(user.district as string) || '—'}
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="a-row">
            <span className="a-row__k">{t('agent.profile.loginId', 'Login ID')}</span>
            <span className="a-row__v">{user.login_id}</span>
          </div>
          <div className="a-row">
            <span className="a-row__k">{t('consumer.profile.phone', 'Phone')}</span>
            <span className="a-row__v">
              {(user.country_code as string) || '+91'} {user.phone}
            </span>
          </div>
          <div className="a-row">
            <span className="a-row__k">{t('address.district', 'District')}</span>
            <span className="a-row__v">{(user.district as string) || '—'}</span>
          </div>
          <div className="a-row">
            <span className="a-row__k">{t('consumer.profile.gender', 'Gender')}</span>
            <span className="a-row__v">
              {user.gender
                ? t(`gender.${String(user.gender).toLowerCase()}`, user.gender as string)
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Employee master (read-only) */}
      {empPairs ? (
        <div className="a-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>
            🧑‍💼 {t('agent.profile.employee', 'Employee Details')}
          </div>
          <div style={{ fontSize: 10, color: 'var(--gray)', marginBottom: 10 }}>
            {t('agent.profile.employeeNote', 'Maintained by Head Office · read-only')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {empPairs.map(([label, v, key]) => (
              <div className="a-row" key={key}>
                <span className="a-row__k">{t(key, label)}</span>
                {/* designation/department/employment type are HO-typed master data
                    and stay as entered; gender is a known vocabulary. */}
                <span className="a-row__v">
                  {key === 'emp.gender' && v !== '—' ? t(`gender.${v.toLowerCase()}`, v) : v}
                </span>
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
            aria-label={t('consumer.profile.gender', 'Gender')}
          >
            <option value="">— Select Gender —</option>
            {/* The VALUE is what the users row stores. */}
            <option value="Male">{t('gender.male', 'Male')}</option>
            <option value="Female">{t('gender.female', 'Female')}</option>
            <option value="Transgender">{t('gender.transgender', 'Transgender')}</option>
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
            placeholder={t('agent.profile.vehicleHint', 'e.g. TN 38 AB 1234 — Bike')}
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            aria-label={t('agent.profile.vehicle', 'Vehicle')}
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
            {t(
              'agent.profile.villagesNote',
              'You’ll be auto-suggested for orders in these villages — for collection and delivery.',
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {villages.length ? (
              villages.map((v, i) => (
                <span className="a-chip" key={v}>
                  {v}
                  <button
                    onClick={() => setVillages(villages.filter((_, j) => j !== i))}
                    aria-label={t('agent.profile.removeVillage', 'Remove {{name}}', { name: v })}
                  >
                    ✕
                  </button>
                </span>
              ))
            ) : (
              <span style={{ fontSize: 12, color: 'var(--gray)' }}>
                {t('agent.profile.noVillages', 'No villages added yet.')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="a-input"
              type="text"
              placeholder={t('agent.profile.addVillage', 'Add a village/town')}
              value={villageInput}
              onChange={(e) => setVillageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addVillage();
                }
              }}
              aria-label={t('agent.profile.addVillageAria', 'Add a village or town')}
            />
            <button className="a-btn-save" onClick={addVillage}>
              {t('consumer.addr.add', 'Add')}
            </button>
          </div>
          <button
            className="a-btn-save"
            style={{ marginTop: 10, width: '100%' }}
            onClick={() =>
              patch(
                { service_villages: villages },
                t('agent.profile.villagesSaved', 'Service villages saved.'),
              )
            }
          >
            {t('agent.profile.saveVillages', 'Save Villages')}
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
            placeholder={t('pwd.currentHint', 'Your current password')}
            value={cpw}
            onChange={(e) => setCpw(e.target.value)}
            autoComplete="current-password"
            aria-label={t('pwd.currentHint', 'Your current password')}
          />
          <input
            className="a-input"
            type="password"
            placeholder={t('agent.profile.newPwHint', 'New password (min 6 chars)')}
            value={npw}
            onChange={(e) => setNpw(e.target.value)}
            autoComplete="new-password"
            aria-label={t('agent.profile.newPwHint', 'New password (min 6 chars)')}
          />
          {pwErr ? <div style={{ fontSize: 11, color: 'var(--red)' }}>{pwErr}</div> : null}
          <button className="a-btn-save" style={{ width: '100%' }} onClick={changePw}>
            {t('pwd.update', 'Update Password')}
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
    </>
  );
}
