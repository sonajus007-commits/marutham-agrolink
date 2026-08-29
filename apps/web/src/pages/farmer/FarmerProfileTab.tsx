import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, Input, FIELD_ERR_CLASS } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  addressDetailRows,
  subscriptionStatus,
  fmtDateShort,
  type SavedAddress,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { AddressFields } from '../../components/AddressFields';
import { useLocations } from '../../hooks/useLocations';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';
import { BankDetailsCard } from './BankDetailsCard';
import { FarmLocationCard } from './FarmLocationCard';
import { ShopHoursCard } from './ShopHoursCard';
import { PublicProfileCard } from './PublicProfileCard';

/* Self-service fields a seller may edit directly (applied immediately via
 * PATCH /auth/me): email + the full address (shared AddressFields). State &
 * District are shown but LOCKED (support-gated — the district scopes their
 * storefront). Bank/business go through the change-request flow, not here. */
interface ProfileDraft {
  email: string;
  addr: SavedAddress;
}

/* The address keys carried on the seller's own user row. */
const ADDR_KEYS = [
  'house_no',
  'street1',
  'street2',
  'landmark',
  'village_town',
  'taluk',
  'district',
  'state',
  'country',
  'pincode',
] as const;

function addrFrom(user: Record<string, unknown>): SavedAddress {
  const a: SavedAddress = {};
  for (const k of ADDR_KEYS) (a as Record<string, unknown>)[k] = (user[k] as string) || '';
  // Village/Town/City is merged onto village_town; seed from the legacy city column
  // for records written before the merge so nothing disappears from the form.
  if (!a.village_town) a.village_town = (user.city as string) || '';
  if (!a.country) a.country = 'India';
  return a;
}

function draftFrom(user: Record<string, unknown>): ProfileDraft {
  return {
    email: (user.email as string) || '',
    addr: addrFrom(user),
  };
}

export function FarmerProfileTab({ onRenew }: { onRenew: () => void }) {
  const { t, i18n } = useTranslation();
  const { user, updateUser } = useAuth();
  const { taluksOf } = useLocations();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(user || {}));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sub = useMemo(() => subscriptionStatus(user || {}), [user]);
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
      const base = draftFrom(user || {});
      const patch: Record<string, string> = {};
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
      toast('Profile updated.', 'ok');
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
  const sellerType = user.seller_type === 'Retailer' ? t('farmer.tagRetailer') : t('farmer.tag');

  return (
    <>
      <Card>
        <h3 className="mb-3 text-md font-bold text-primary">👤 {t('farmer.profile.title')}</h3>

        <div className="mb-3 rounded-sm bg-surface-muted p-3">
          <div className="text-2xs uppercase tracking-wide text-fg-muted">
            {t('farmer.profile.loginId')}
          </div>
          <div className="text-md font-black text-primary">{user.login_id || '—'}</div>
          <div className="text-2xs text-fg-muted">{t('farmer.profile.loginNote')}</div>
        </div>

        <dl className="flex flex-col">
          <ProfRow label={t('farmer.profile.name')} value={fullName} />
          <ProfRow label={t('farmer.profile.type')} value={sellerType} />
          <ProfRow
            label={t('farmer.profile.phone')}
            value={`${(user.country_code as string) || '+91'} ${user.phone}`}
            mono
          />
          <ProfRow label={t('farmer.profile.email')} value={(user.email as string) || '—'} />
        </dl>

        {/* The unified address block — identical fields, order and labels across
            every profile (via addressDetailRows). */}
        <h4 className="mb-1 mt-3 text-sm font-bold text-primary">
          📍 {t('farmer.profile.address')}
        </h4>
        <dl className="flex flex-col">
          {addrRows.map(([key, label, value]) => (
            <ProfRow key={key} label={t(key, label)} value={value} />
          ))}
        </dl>

        {!editing ? (
          <Button variant="ghost" className="mt-3" onClick={openEdit}>
            ✏️ {t('farmer.profile.edit')}
          </Button>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <Field label={t('farmer.profile.email')}>
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
              <div className={FIELD_ERR_CLASS} role="alert">
                {error}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : t('farmer.profile.save')}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                {t('farmer.profile.cancel')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {sub.level !== 'none' ? (
        <Card>
          <h3 className="mb-3 text-md font-bold text-primary">📅 {t('farmer.sub.title')}</h3>
          <dl className="flex flex-col">
            <ProfRow
              label={t('farmer.profile.plan')}
              value={
                sub.plan
                  ? t(`farmer.sub.plan.${sub.plan.replace(/\s+/g, '').toLowerCase()}`, sub.plan)
                  : '—'
              }
            />
            {sub.expiresAt ? (
              <ProfRow
                label={t('farmer.sub.validUntil')}
                value={fmtDateShort(sub.expiresAt, i18n.language)}
              />
            ) : null}
          </dl>
          <Button variant="ghost" className="mt-3" onClick={onRenew}>
            💳 {t('farmer.sub.renew')}
          </Button>
        </Card>
      ) : null}

      {/* Shop hours are a RETAILER concept; a farmer's availability is the
          per-listing cutoff instead. */}
      {user.seller_type === 'Retailer' ? <ShopHoursCard /> : null}
      <FarmLocationCard />
      <PublicProfileCard />
      <BankDetailsCard />
      <ChangePasswordCard />
    </>
  );
}

function ProfRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <dt className="text-2xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd
        className={
          mono ? 'text-sm font-semibold text-fg tabular-nums' : 'text-sm font-semibold text-fg'
        }
      >
        {value}
      </dd>
    </div>
  );
}
