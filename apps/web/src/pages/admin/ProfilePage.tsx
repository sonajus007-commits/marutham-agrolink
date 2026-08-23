import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, Input, Select, Spinner } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  addressDetailRows,
  employeeAddressObject,
  employeeDetailPairs,
  GENDERS,
  type AddressObject,
  type EmployeeRecord,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';
import { OfficeHubCard } from '../../components/OfficeHubCard';

/* The admin's own account — the console's last missing screen (every other role
 * has had a profile since its migration).
 *
 * Three cards, mirroring the legacy panel:
 *  1. Identity + the small set of fields staff may edit on themselves.
 *  2. The employee master record — READ-ONLY. It is Head Office's to maintain
 *     (designation, department, reporting manager, Employee ID), so a promotion
 *     shows up here on the next visit and nobody can self-promote.
 *  3. Change password (the card the consumer and seller profiles already share).
 *
 * PATCH /auth/me would also accept name and address, but staff do not own those:
 * their address of record lives on the employee row. So the form stays at the
 * three fields the legacy console allowed — gender, email, alternate phone. */

/** The fields an admin may change on their own user record. */
interface ProfileDraft {
  gender: string;
  email: string;
  alt_phone: string;
}

/* Coerce a user row into an AddressObject — address fields reach the user row
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

const draftFrom = (u: Record<string, unknown>): ProfileDraft => ({
  gender: String(u.gender || ''),
  email: String(u.email || ''),
  alt_phone: String(u.alt_phone || ''),
});

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(user || {}));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [empLoading, setEmpLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .getMyEmployeeRecord()
      // A staff account with no employee row is normal (and a 403/404 here must
      // not take the whole profile down) — the card simply does not render.
      .catch(() => ({ employee: null }))
      .then((res) => {
        if (!active) return;
        setEmployee((res.employee as EmployeeRecord) || null);
        setEmpLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!user) return null;

  function startEdit() {
    setDraft(draftFrom(user || {}));
    setError(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const base = draftFrom(user || {});
      // Send only what actually changed — PATCH /me 400s on an empty body.
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
      toast(t('admin.profile.saved'), 'ok');
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.profile.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const fullName = `${user.fname || ''}${user.lname ? ' ' + user.lname : ''}`.trim() || '—';
  const pairs = employeeDetailPairs(employee, undefined, { excludeAddress: true });
  // Staff address of record is the HO employee master (read-only); fall back to
  // the user row for contract/unlinked staff with no employee record.
  const addrRows = addressDetailRows(
    employee ? employeeAddressObject(employee) : userAddress(user),
    '—',
  );
  /* Contract or unlinked staff may carry an Employee No on the user row with no
   * employee record behind it — still worth showing, just thinner. */
  const thinEmployee = !pairs && (user.emp_id || user.employment_type);

  return (
    <>
      <h1 className="mb-4 text-xl font-bold text-primary">{t('admin.profile.title')}</h1>

      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-3 text-sm font-bold text-primary">👤 {t('admin.profile.account')}</h2>

          <div className="mb-4 rounded-base bg-surface-muted p-3 text-center">
            <div className="text-2xs font-bold uppercase tracking-wide text-fg-muted">
              {t('admin.profile.loginId')}
            </div>
            <div className="text-md font-bold tracking-wider text-primary">
              {user.login_id || '—'}
            </div>
            <div className="mt-0.5 text-2xs text-fg-muted">{t('admin.profile.loginIdNote')}</div>
          </div>

          {!editing ? (
            <>
              <Row label={t('admin.profile.name')} value={fullName} />
              <Row label={t('admin.profile.gender')} value={String(user.gender || '—')} />
              <Row
                label={t('admin.profile.phone')}
                value={`${String(user.country_code || '+91')} ${user.phone}`}
                mono
              />
              <Row label={t('admin.profile.altPhone')} value={String(user.alt_phone || '—')} mono />
              <Row label={t('admin.profile.email')} value={String(user.email || '—')} />
              <Row label={t('admin.profile.role')} value={String(user.admin_role || 'Admin')} />
              <Row label={t('admin.profile.district')} value={String(user.district || '—')} />
              <div className="mt-3">
                <Button variant="ghost" onClick={startEdit}>
                  ✏️ {t('admin.profile.edit')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mb-3 text-2xs text-fg-muted">{t('admin.profile.editNote')}</p>

              <Field label={t('admin.profile.gender')}>
                {(p) => (
                  <Select
                    {...p}
                    value={draft.gender}
                    onChange={(e) => setDraft({ ...draft, gender: e.target.value })}
                  >
                    <option value="">{t('admin.profile.selectGender')}</option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label={t('admin.profile.email')}>
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    placeholder="your@email.com"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                )}
              </Field>

              <Field label={t('admin.profile.altPhone')}>
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    inputMode="numeric"
                    value={draft.alt_phone}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        alt_phone: e.target.value.replace(/\D/g, '').slice(0, 10),
                      })
                    }
                  />
                )}
              </Field>

              {error ? (
                <p className="mb-2 text-2xs text-danger" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex gap-2">
                <Button onClick={() => void save()} disabled={busy}>
                  {busy ? t('admin.profile.saving') : t('admin.profile.save')}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                  {t('admin.profile.cancel')}
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* Address (read-only) — the same unified block every profile shows. Staff
            address of record is the HO employee master, so it is not self-editable. */}
        <Card>
          <h2 className="mb-1 text-sm font-bold text-primary">
            📍 {t('address.registered', 'Registered address')}
          </h2>
          <p className="mb-3 text-2xs text-fg-muted">{t('admin.profile.employeeNote')}</p>
          {addrRows.map(([key, label, value]) => (
            <Row key={key} label={t(key, label)} value={value} />
          ))}
        </Card>

        {/* Office hub — the hub this staffer is assigned to (Hub Incharge / Hub
            Manager and any VCO/DA reaching this page), with its office address.
            Read-only; assigned by admin/HR. Renders nothing when no hub is set. */}
        {['VCO', 'Delivery Agent', 'Hub Incharge', 'Hub Manager'].includes(
          String(user.admin_role),
        ) ? (
          <OfficeHubCard />
        ) : null}

        {/* Employee master — HO's record, shown as-is. */}
        {empLoading ? (
          <Card>
            <Spinner />
          </Card>
        ) : pairs ? (
          <Card>
            <h2 className="mb-1 text-sm font-bold text-primary">
              🧑‍💼 {t('admin.profile.employee')}
            </h2>
            <p className="mb-3 text-2xs text-fg-muted">{t('admin.profile.employeeNote')}</p>
            {pairs.map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
          </Card>
        ) : thinEmployee ? (
          <Card>
            <h2 className="mb-1 text-sm font-bold text-primary">
              🧑‍💼 {t('admin.profile.employee')}
            </h2>
            <p className="mb-3 text-2xs text-fg-muted">{t('admin.profile.employeeNote')}</p>
            <Row label={t('admin.profile.empNo')} value={String(user.emp_id || '—')} mono />
            <Row
              label={t('admin.profile.employmentType')}
              value={String(user.employment_type || '—')}
            />
            <p className="mt-2 text-2xs text-fg-muted">{t('admin.profile.employeePartial')}</p>
          </Card>
        ) : null}

        <ChangePasswordCard />
      </div>
    </>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <span className="text-2xs uppercase tracking-wide text-fg-muted">{label}</span>
      <span className={`text-sm font-semibold text-fg ${mono ? 'tabular-nums' : ''}`}>{value}</span>
    </div>
  );
}
