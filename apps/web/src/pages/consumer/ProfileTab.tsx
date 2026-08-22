import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input, Select, FIELD_ERR_CLASS } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { addressDetailRows, type SavedAddress } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { AddressFields } from '../../components/AddressFields';
import { useLocations } from '../../hooks/useLocations';
import { AddressBook } from './AddressBook';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';

/* The VALUE is what the users row stores and what the API expects; only the
 * option text is translated. genderKey mirrors the statusKey pattern. */
const GENDERS = ['Male', 'Female', 'Transgender'];
const genderKey = (g: string) => `gender.${g.toLowerCase()}`;

/* The self-editable account fields: gender, email, and the full address (shared
 * AddressFields). State & District are shown but LOCKED — the district scopes the
 * storefront and the delivery hub, so support changes it, not the customer. */
interface ProfileDraft {
  gender: string;
  email: string;
  addr: SavedAddress;
}

/* The address keys the customer's own record carries, pulled off the user row. */
const ADDR_KEYS = [
  'house_no',
  'street1',
  'street2',
  'landmark',
  'village_town',
  'city',
  'taluk',
  'district',
  'state',
  'country',
  'pincode',
] as const;

function addrFrom(user: Record<string, unknown>): SavedAddress {
  const a: SavedAddress = {};
  for (const k of ADDR_KEYS) (a as Record<string, unknown>)[k] = (user[k] as string) || '';
  if (!a.country) a.country = 'India';
  return a;
}

function draftFrom(user: Record<string, unknown>): ProfileDraft {
  return {
    gender: (user.gender as string) || '',
    email: (user.email as string) || '',
    addr: addrFrom(user),
  };
}

export function ProfileTab() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const { taluksOf } = useLocations();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(user || {}));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  // A taluk is required whenever the (support-set) district actually lists any —
  // mirrors the registration rule, and keeps non-taluk districts submittable.
  const districtHasTaluks = taluksOf(draft.addr.state || '', draft.addr.district || '').length > 0;

  function openEdit() {
    setDraft(draftFrom(user || {}));
    setError(null);
    setEditing(true);
  }

  async function save() {
    const a = draft.addr;
    if (a.pincode && !/^\d{6}$/.test(a.pincode))
      return setError(t('consumer.profile.badPincode', 'Pincode must be 6 digits.'));
    if (districtHasTaluks && !a.taluk?.trim())
      return setError(t('address.err.taluk', 'Select a taluk.'));
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email))
      return setError(t('consumer.profile.badEmail', 'Enter a valid email address.'));
    setError(null);
    setBusy(true);
    try {
      // Send only what changed; PATCH /auth/me rejects an empty payload. State &
      // District are locked in the form, so they never diff.
      const base = draftFrom(user || {});
      const patch: Record<string, string> = {};
      if (draft.gender !== base.gender) patch.gender = draft.gender;
      if (draft.email !== base.email) patch.email = draft.email;
      for (const k of ADDR_KEYS) {
        const next = String((a as Record<string, unknown>)[k] ?? '');
        const prev = String((base.addr as Record<string, unknown>)[k] ?? '');
        if (next !== prev) patch[k] = next;
      }
      if (Object.keys(patch).length === 0) {
        setEditing(false);
        return;
      }
      const res = await api.patchMe(patch);
      updateUser(res.user);
      toast(t('consumer.profile.updated', 'Profile updated.'), 'ok');
      setEditing(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t('consumer.profile.updateFailed', 'Could not update profile'),
      );
    } finally {
      setBusy(false);
    }
  }

  const fullName = `${user.fname || ''}${user.lname ? ' ' + user.lname : ''}`.trim() || '—';
  const addrRows = addressDetailRows(addrFrom(user), '—');

  return (
    <>
      <section className="ord-card">
        <h3>👤 {t('consumer.profile.title', 'My Profile')}</h3>

        <div className="lid-box">
          <div className="lid-lbl">{t('consumer.profile.loginId', 'Your Login ID')}</div>
          <div className="lid-val">{user.login_id || '—'}</div>
          <div className="lid-note">
            {t('consumer.profile.loginIdNote', 'Use this ID or phone number to login')}
          </div>
        </div>

        <dl className="prof-rows">
          <ProfRow label={t('consumer.profile.fullName', 'Full Name')} value={fullName} />
          <ProfRow
            label={t('consumer.profile.gender', 'Gender')}
            value={user.gender ? t(genderKey(user.gender as string), user.gender as string) : '—'}
          />
          <ProfRow
            label={t('consumer.profile.phone', 'Phone')}
            value={`${(user.country_code as string) || '+91'} ${user.phone}`}
            mono
          />
          <ProfRow
            label={t('consumer.profile.email', 'Email')}
            value={(user.email as string) || '—'}
          />
        </dl>

        {/* The unified address block — same fields, order and labels as every
            other profile (via addressDetailRows). */}
        <h4 className="prof-form__title" style={{ marginTop: 14 }}>
          📍 {t('consumer.profile.address', 'Address')}
        </h4>
        <dl className="prof-rows">
          {addrRows.map(([key, label, value]) => (
            <ProfRow key={key} label={t(key, label)} value={value} />
          ))}
        </dl>

        {!editing ? (
          <button className="prof-editbtn" onClick={openEdit}>
            ✏️ {t('consumer.profile.edit', 'Edit Profile')}
          </button>
        ) : (
          <div className="prof-form">
            <h4 className="prof-form__title">
              {t('consumer.profile.editableFields', 'Editable Fields')}
            </h4>

            <Field label={t('consumer.profile.gender', 'Gender')}>
              {(p) => (
                <Select
                  {...p}
                  value={draft.gender}
                  onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value }))}
                >
                  <option value="">
                    — {t('consumer.profile.selectGender', 'Select Gender')} —
                  </option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {t(genderKey(g), g)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label={t('consumer.profile.email', 'Email')}>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  autoComplete="email"
                  placeholder="your@email.com"
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                />
              )}
            </Field>

            <AddressFields
              value={draft.addr}
              onChange={(addr) => setDraft((d) => ({ ...d, addr }))}
              showStreet2
              locked={{ state: true, district: true }}
              required={{ taluk: districtHasTaluks }}
            />

            {error ? (
              <div className={FIELD_ERR_CLASS} role="alert" style={{ marginBottom: 8 }}>
                {error}
              </div>
            ) : null}

            <div className="prof-actions">
              <Button onClick={save} disabled={busy}>
                {busy
                  ? t('consumer.addr.saving', 'Saving…')
                  : t('consumer.profile.saveChanges', 'Save Changes')}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
            </div>
          </div>
        )}
      </section>

      <AddressBook />
      <ChangePasswordCard />
    </>
  );
}

function ProfRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="prof-row">
      <dt>{label}</dt>
      <dd className={mono ? 'is-mono' : undefined}>{value}</dd>
    </div>
  );
}
