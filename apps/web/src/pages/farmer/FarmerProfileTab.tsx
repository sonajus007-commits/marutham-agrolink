import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, Input, FIELD_ERR_CLASS } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { buildAddress, subscriptionStatus, fmtDateShort } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';
import { BankDetailsCard } from './BankDetailsCard';

/* Self-service fields a seller may edit directly (applied immediately via
 * PATCH /auth/me). District/state are support-gated and bank/business go through
 * the change-request flow, so neither appears here. */
interface ProfileDraft {
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
    email: s('email'), street1: s('street1'), street2: s('street2'),
    village_town: s('village_town'), city: s('city'), pincode: s('pincode'),
  };
}

export function FarmerProfileTab({ onRenew }: { onRenew: () => void }) {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(user || {}));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sub = useMemo(() => subscriptionStatus(user || {}), [user]);
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
  const address = buildAddress(user);
  const sellerType = user.seller_type === 'Retailer' ? t('farmer.tagRetailer') : t('farmer.tag');

  return (
    <>
      <Card>
        <h3 className="mb-3 text-md font-bold text-primary">👤 {t('farmer.profile.title')}</h3>

        <div className="mb-3 rounded-sm bg-surface-muted p-3">
          <div className="text-2xs uppercase tracking-wide text-fg-muted">{t('farmer.profile.loginId')}</div>
          <div className="text-md font-black text-primary">{user.login_id || '—'}</div>
          <div className="text-2xs text-fg-muted">{t('farmer.profile.loginNote')}</div>
        </div>

        <dl className="flex flex-col">
          <ProfRow label={t('farmer.profile.name')} value={fullName} />
          <ProfRow label={t('farmer.profile.type')} value={sellerType} />
          <ProfRow label={t('farmer.profile.phone')} value={`${(user.country_code as string) || '+91'} ${user.phone}`} mono />
          <ProfRow label={t('farmer.profile.email')} value={(user.email as string) || '—'} />
          <ProfRow label={t('farmer.profile.district')} value={(user.district as string) || '—'} />
          <ProfRow label={t('farmer.profile.address')} value={address || '—'} />
        </dl>

        {!editing ? (
          <Button variant="ghost" className="mt-3" onClick={openEdit}>✏️ {t('farmer.profile.edit')}</Button>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <Field label={t('farmer.profile.email')}>
              {(p) => (
                <Input {...p} type="email" autoComplete="email" placeholder="your@email.com"
                  value={draft.email} onChange={(e) => set('email', e.target.value)} />
              )}
            </Field>
            <Field label={t('farmer.profile.street1')}>
              {(p) => <Input {...p} type="text" value={draft.street1} onChange={(e) => set('street1', e.target.value)} />}
            </Field>
            <Field label={t('farmer.profile.street2')}>
              {(p) => <Input {...p} type="text" value={draft.street2} onChange={(e) => set('street2', e.target.value)} />}
            </Field>
            <Field label={t('farmer.profile.villageTown')}>
              {(p) => <Input {...p} type="text" value={draft.village_town} onChange={(e) => set('village_town', e.target.value)} />}
            </Field>
            <Field label={t('farmer.profile.city')}>
              {(p) => <Input {...p} type="text" value={draft.city} onChange={(e) => set('city', e.target.value)} />}
            </Field>
            <Field label={t('farmer.profile.pincode')}>
              {(p) => (
                <Input {...p} type="text" inputMode="numeric" autoComplete="postal-code"
                  value={draft.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} />
              )}
            </Field>

            {error ? <div className={FIELD_ERR_CLASS} role="alert">{error}</div> : null}

            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : t('farmer.profile.save')}</Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>{t('farmer.profile.cancel')}</Button>
            </div>
          </div>
        )}
      </Card>

      {sub.level !== 'none' ? (
        <Card>
          <h3 className="mb-3 text-md font-bold text-primary">📅 {t('farmer.sub.title')}</h3>
          <dl className="flex flex-col">
            <ProfRow label={t('farmer.profile.plan')} value={sub.plan || '—'} />
            {sub.expiresAt ? <ProfRow label={t('farmer.sub.validUntil')} value={fmtDateShort(sub.expiresAt)} /> : null}
          </dl>
          <Button variant="ghost" className="mt-3" onClick={onRenew}>💳 {t('farmer.sub.renew')}</Button>
        </Card>
      ) : null}

      <BankDetailsCard />
      <ChangePasswordCard />
    </>
  );
}

function ProfRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <dt className="text-2xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className={mono ? 'text-sm font-semibold text-fg tabular-nums' : 'text-sm font-semibold text-fg'}>{value}</dd>
    </div>
  );
}
