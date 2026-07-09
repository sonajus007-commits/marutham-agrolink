import { useState } from 'react';
import { Button, Field } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { buildAddress } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { AddressBook } from './AddressBook';
import { ChangePasswordCard } from './ChangePasswordCard';

const GENDERS = ['Male', 'Female', 'Transgender'];

/* Fields a consumer may edit on their own record. Note `state`/`district` are
 * deliberately absent: the district scopes the storefront and the delivery hub,
 * so it is changed by support, not self-service. Matches the legacy form. */
interface ProfileDraft {
  gender: string;
  email: string;
  street1: string;
  street2: string;
  village_town: string;
  city: string;
  pincode: string;
}

function draftFrom(user: Record<string, unknown>): ProfileDraft {
  const s = (k: string) => (user[k] as string) || '';
  return {
    gender: s('gender'), email: s('email'), street1: s('street1'), street2: s('street2'),
    village_town: s('village_town'), city: s('city'), pincode: s('pincode'),
  };
}

export function ProfileTab() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(user || {}));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const set = (k: keyof ProfileDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  function openEdit() {
    setDraft(draftFrom(user || {}));
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (draft.pincode && !/^\d{6}$/.test(draft.pincode)) return setError('Pincode must be 6 digits.');
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email)) return setError('Enter a valid email address.');
    setError(null);
    setBusy(true);
    try {
      // Send only what changed; PATCH /auth/me rejects an empty payload.
      const base = draftFrom(user || {});
      const patch: Record<string, string> = {};
      (Object.keys(draft) as (keyof ProfileDraft)[]).forEach((k) => {
        if (draft[k] !== base[k]) patch[k] = draft[k];
      });
      if (Object.keys(patch).length === 0) {
        setEditing(false);
        return;
      }
      const res = await api.patchMe(patch);
      updateUser(res.user);
      toast('Profile updated.', 'ok');
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update profile');
    } finally {
      setBusy(false);
    }
  }

  const fullName = `${user.fname || ''}${user.lname ? ' ' + user.lname : ''}`.trim() || '—';
  const profileAddress = buildAddress(user);

  return (
    <>
      <section className="ord-card">
        <h3>👤 My Profile</h3>

        <div className="lid-box">
          <div className="lid-lbl">Your Login ID</div>
          <div className="lid-val">{user.login_id || '—'}</div>
          <div className="lid-note">Use this ID or phone number to login</div>
        </div>

        <dl className="prof-rows">
          <ProfRow label="Full Name" value={fullName} />
          <ProfRow label="Gender" value={(user.gender as string) || '—'} />
          <ProfRow label="Phone" value={`${(user.country_code as string) || '+91'} ${user.phone}`} mono />
          <ProfRow label="Email" value={(user.email as string) || '—'} />
          <ProfRow label="District" value={(user.district as string) || '—'} />
          <ProfRow label="Address" value={profileAddress || '—'} />
        </dl>

        {!editing ? (
          <button className="prof-editbtn" onClick={openEdit}>✏️ Edit Profile</button>
        ) : (
          <div className="prof-form">
            <h4 className="prof-form__title">Editable Fields</h4>

            <Field label="Gender">
              {(p) => (
                <select {...p} className="ma-select" value={draft.gender} onChange={(e) => set('gender', e.target.value)}>
                  <option value="">— Select Gender —</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
            </Field>

            <Field label="Email">
              {(p) => (
                <input {...p} className="ma-input" type="email" autoComplete="email" placeholder="your@email.com"
                  value={draft.email} onChange={(e) => set('email', e.target.value)} />
              )}
            </Field>

            <Field label="Street Line 1">
              {(p) => <input {...p} className="ma-input" type="text" value={draft.street1} onChange={(e) => set('street1', e.target.value)} />}
            </Field>
            <Field label="Street Line 2">
              {(p) => <input {...p} className="ma-input" type="text" value={draft.street2} onChange={(e) => set('street2', e.target.value)} />}
            </Field>
            <Field label="Village / Town">
              {(p) => <input {...p} className="ma-input" type="text" value={draft.village_town} onChange={(e) => set('village_town', e.target.value)} />}
            </Field>
            <Field label="City">
              {(p) => <input {...p} className="ma-input" type="text" value={draft.city} onChange={(e) => set('city', e.target.value)} />}
            </Field>
            <Field label="Pincode">
              {(p) => (
                <input {...p} className="ma-input" type="text" inputMode="numeric" autoComplete="postal-code"
                  value={draft.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} />
              )}
            </Field>

            {error ? <div className="ma-field__err" role="alert" style={{ marginBottom: 8 }}>{error}</div> : null}

            <div className="prof-actions">
              <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
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
