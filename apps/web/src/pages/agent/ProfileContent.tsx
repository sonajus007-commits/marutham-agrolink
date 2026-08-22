import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@marutham/api-client';
import {
  addressDetailRows,
  employeeAddressObject,
  employeeDetailPairs,
  type AddressDetailRow,
  type AddressObject,
  type EmployeeDetailPair,
  type EmployeeRecord,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { DeliveryAgentFields } from './DeliveryAgentFields';

/* Coerce a user row into an AddressObject — the address fields reach the user row
 * through its index signature as `unknown`, so pick them out as strings. */
function userAddress(u: Record<string, unknown> | null): AddressObject {
  const s = (k: string) => (u?.[k] as string) || null;
  return {
    house_no: s('house_no'),
    street1: s('street1'),
    street2: s('street2'),
    landmark: s('landmark'),
    village_town: s('village_town'),
    city: s('city'),
    taluk: s('taluk'),
    district: s('district'),
    state: s('state'),
    country: s('country'),
    pincode: s('pincode'),
  };
}

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
  const [empPairs, setEmpPairs] = useState<EmployeeDetailPair[] | null>(null);
  const [addrRows, setAddrRows] = useState<AddressDetailRow[]>([]);
  const [cpw, setCpw] = useState('');
  const [npw, setNpw] = useState('');
  const [pwErr, setPwErr] = useState('');

  // Seed from the current user on mount and whenever the user record changes.
  useEffect(() => {
    if (!user) return;
    setGender((user.gender as string) || '');
    setVehicle((user.agent_vehicle as string) || '');
    setCpw('');
    setNpw('');
    setPwErr('');
    let active = true;
    api
      .getMyEmployeeRecord()
      .then((res) => {
        if (!active) return;
        const emp = res.employee as EmployeeRecord | null;
        // Address block is rendered structured below, so drop the squashed row.
        setEmpPairs(employeeDetailPairs(emp, i18n.language, { excludeAddress: true }));
        // Staff address of record is the HO employee master (read-only); fall back
        // to the user row for contract/unlinked staff who have no employee record.
        setAddrRows(addressDetailRows(emp ? employeeAddressObject(emp) : userAddress(user), '—'));
      })
      .catch(() => {
        if (!active) return;
        setEmpPairs(null);
        setAddrRows(addressDetailRows(userAddress(user), '—'));
      });
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

      {/* Address (read-only) — the same unified block every profile shows. Staff
          address of record is the HO employee master, so it is not self-editable. */}
      <div className="a-card">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>
          📍 {t('address.registered', 'Registered address')}
        </div>
        <div style={{ fontSize: 10, color: 'var(--gray)', marginBottom: 10 }}>
          {t('agent.profile.employeeNote', 'Maintained by Head Office · read-only')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {addrRows.map(([key, label, value]) => (
            <div className="a-row" key={key}>
              <span className="a-row__k">{t(key, label)}</span>
              <span className="a-row__v">{value}</span>
            </div>
          ))}
        </div>
      </div>

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

      {/* Delivery-Agent coverage, hub and daily readiness. VCOs have no run. */}
      {!isVCO ? <DeliveryAgentFields /> : null}

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
