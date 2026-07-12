import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input, Select } from '@marutham/ui';
import { api, type RegisterPayload, type RegisterResponse } from '@marutham/api-client';
import {
  emptyRegisterForm, validateRegistration, hasErrors, passwordRuleResults,
  quoteRegistration, SUBSCRIPTION_PLANS, GENDERS, BUSINESS_TYPES,
  type RegisterForm, type RegisterErrors, type RegisterRole, type RegisterSellerType,
} from '@marutham/lib';
import { useAuth } from '../auth/AuthContext';
import { useLocations } from '../hooks/useLocations';
import { AddressFields, type AddressFieldKey } from '../components/AddressFields';

/* Sign-up — the last big piece of the legacy index.html.
 *
 * One form, three shapes: a consumer, a Farmer and a Retailer. Consumers are
 * created active, so we sign them straight in; sellers land in `pending_review`
 * and get a login-ID panel instead — they cannot sign in until Head Office
 * approves them, and they pay only after that (see SubscriptionGate).
 *
 * Validation and fee quoting are pure and live in @marutham/lib; this file is
 * the form, the branching and the payload. */

/** Trim to undefined — an empty string would write "" over a column. */
const s = (v: string): string | undefined => (v.trim() ? v.trim() : undefined);

export function Register() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const { taluksOf } = useLocations();

  const [form, setForm] = useState<RegisterForm>(() => emptyRegisterForm('consumer'));
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  /** Set once a seller's application is in — swaps the form for the pending panel. */
  const [submitted, setSubmitted] = useState<RegisterResponse | null>(null);

  const isSeller = form.role === 'farmer';
  const isFarmer = isSeller && form.seller_type === 'Farmer';
  const isRetailer = isSeller && form.seller_type === 'Retailer';

  const set = (patch: Partial<RegisterForm>) => setForm((f) => ({ ...f, ...patch }));

  // Only demand a taluk when the chosen district actually has any.
  const districtHasTaluks = taluksOf(form.address.state || '', form.address.district || '').length > 0;

  const pwRules = useMemo(() => passwordRuleResults(form.password), [form.password]);
  const quote = useMemo(
    () => quoteRegistration(form.subscription_plan, form.gender),
    [form.subscription_plan, form.gender],
  );

  /* Keep what's already typed — name, address and password are asked of everyone,
   * and the legacy page (two separate forms) never made you retype them either.
   * The role-specific fields left behind are ignored by both the validator and
   * the payload, so they cannot leak into the wrong kind of account. */
  function switchRole(role: RegisterRole) {
    set({ role });
    setErrors({});
    setServerError('');
  }

  function switchSellerType(seller_type: RegisterSellerType) {
    set({ seller_type });
    setErrors({});
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError('');

    const faults = validateRegistration(form, { districtHasTaluks });
    setErrors(faults);
    if (hasErrors(faults)) return;

    const a = form.address;
    const payload: RegisterPayload = {
      phone: form.phone,
      password: form.password,
      role: form.role,
      fname: form.fname.trim(),
      lname: s(form.lname),
      email: s(form.email),
      gender: form.gender || undefined,
      country_code: form.country_code,
      house_no: s(a.house_no || ''),
      street1: s(a.street1 || ''),
      street2: s(a.street2 || ''),
      landmark: s(a.landmark || ''),
      village_town: s(a.village_town || ''),
      city: s(a.city || ''),
      taluk: s(a.taluk || ''),
      district: s(a.district || ''),
      state: s(a.state || ''),
      pincode: (a.pincode || '').trim(),
      country: 'India',
      ...(isSeller && {
        seller_type: form.seller_type,
        subscription_plan: form.subscription_plan,
      }),
      ...(isFarmer && {
        aadhar: form.aadhar,
        bank_name: s(form.bank_name),
        bank_account: form.bank_account,
        ifsc: form.ifsc ? form.ifsc.toUpperCase() : undefined,
      }),
      ...(isRetailer && {
        business_name: s(form.business_name),
        gst_number: form.gst_number ? form.gst_number.toUpperCase() : undefined,
        business_type: s(form.business_type),
      }),
    };

    setBusy(true);
    try {
      const res = await api.register(payload);
      if (isSeller) {
        // No session: the account is pending_review and cannot log in yet.
        setSubmitted(res);
        window.scrollTo({ top: 0 });
      } else {
        // Consumers are active on creation — sign them in and drop them home.
        await login(form.phone, form.password);
        navigate('/', { replace: true });
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('reg.failed'));
      window.scrollTo({ top: 0 });
    } finally {
      setBusy(false);
    }
  }

  if (submitted) return <PendingPanel loginId={submitted.login_id} />;

  /* The address means different things to a farm, a shop and a home, so the
   * labels and the required-markers move with the role. */
  const addressLabels: Partial<Record<AddressFieldKey, string>> = {
    house_no: isFarmer ? t('reg.addr.survey') : isRetailer ? t('reg.addr.unit') : t('reg.addr.house'),
    street1: t('reg.addr.street1'),
    street2: t('reg.addr.street2'),
    landmark: t('reg.addr.landmark'),
    state: t('reg.addr.state'),
    district: t('reg.addr.district'),
    taluk: t('reg.addr.taluk'),
    village_town: isRetailer ? t('reg.addr.area') : t('reg.addr.village'),
    city: t('reg.addr.city'),
    pincode: t('reg.addr.pincode'),
  };

  return (
    <div className="login-wrap">
      <div className="login-card login-card--wide">
        <h1>{t('reg.title')}</h1>
        <p className="sub">{t('brand')}</p>

        {serverError ? <div className="form-error" role="alert">{serverError}</div> : null}

        {/* ── Who is signing up ── */}
        <div className="reg-roles" role="radiogroup" aria-label={t('reg.roleLegend')}>
          <RoleButton on={!isSeller} icon="🛒" label={t('reg.roleConsumer')} onClick={() => switchRole('consumer')} />
          <RoleButton on={isSeller} icon="🌾" label={t('reg.roleSeller')} onClick={() => switchRole('farmer')} />
        </div>

        <form onSubmit={onSubmit} noValidate>
          {isSeller ? (
            <div className="auth-tabs" role="tablist" aria-label={t('reg.sellerTypeLegend')}>
              <button type="button" role="tab" aria-selected={isFarmer}
                className={`auth-tab ${isFarmer ? 'active' : ''}`}
                onClick={() => switchSellerType('Farmer')}>👨‍🌾 {t('reg.farmer')}</button>
              <button type="button" role="tab" aria-selected={isRetailer}
                className={`auth-tab ${isRetailer ? 'active' : ''}`}
                onClick={() => switchSellerType('Retailer')}>🏪 {t('reg.retailer')}</button>
            </div>
          ) : null}

          {/* ── Personal ── */}
          <h2 className="reg-section">{t('reg.personal')}</h2>
          <div className="reg-grid">
            <Field label={t('reg.fname')} required error={errors.fname}>
              {(p) => <Input {...p} type="text" autoComplete="given-name" value={form.fname}
                onChange={(e) => set({ fname: e.target.value })} />}
            </Field>
            <Field label={t('reg.lname')}>
              {(p) => <Input {...p} type="text" autoComplete="family-name" value={form.lname}
                onChange={(e) => set({ lname: e.target.value })} />}
            </Field>
          </div>

          <Field label={t('reg.gender')} required error={errors.gender}
            hint={isSeller ? t('reg.genderHint') : undefined}>
            {(p) => (
              <Select {...p} value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
                <option value="">{t('reg.selectGender')}</option>
                {GENDERS.map((g) => <option key={g} value={g}>{t(`reg.gender.${g}`)}</option>)}
              </Select>
            )}
          </Field>

          <Field label={t('reg.phone')} required error={errors.phone} hint={t('reg.phoneHint')}>
            {(p) => <Input {...p} type="tel" inputMode="numeric" autoComplete="tel" value={form.phone}
              onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />}
          </Field>

          <Field label={t('reg.email')} error={errors.email}>
            {(p) => <Input {...p} type="email" autoComplete="email" placeholder="your@email.com"
              value={form.email} onChange={(e) => set({ email: e.target.value })} />}
          </Field>

          {/* ── Address ── */}
          <h2 className="reg-section">
            {isFarmer ? t('reg.farmAddress') : isRetailer ? t('reg.businessAddress') : t('reg.address')}
          </h2>
          <AddressFields
            value={form.address}
            onChange={(address) => set({ address })}
            showStreet2
            labels={addressLabels}
            required={{ street1: true, city: true, village_town: isFarmer, taluk: districtHasTaluks }}
            errors={{
              street1: errors.street1, state: errors.state, district: errors.district,
              taluk: errors.taluk, city: errors.city, pincode: errors.pincode,
              village_town: errors.village_town,
            }}
          />

          {/* ── Seller KYC ── */}
          {isFarmer ? (
            <>
              <h2 className="reg-section">{t('reg.kyc')}</h2>
              <Field label={t('reg.aadhaar')} required error={errors.aadhar}>
                {(p) => <Input {...p} type="text" inputMode="numeric" placeholder="12-digit Aadhaar"
                  value={form.aadhar}
                  onChange={(e) => set({ aadhar: e.target.value.replace(/\D/g, '').slice(0, 12) })} />}
              </Field>
              <Field label={t('reg.bankName')} required error={errors.bank_name}>
                {(p) => <Input {...p} type="text" value={form.bank_name}
                  onChange={(e) => set({ bank_name: e.target.value })} />}
              </Field>
              <Field label={t('reg.bankAccount')} required error={errors.bank_account}>
                {(p) => <Input {...p} type="text" inputMode="numeric" value={form.bank_account}
                  onChange={(e) => set({ bank_account: e.target.value.replace(/\D/g, '').slice(0, 18) })} />}
              </Field>
              <Field label={t('reg.bankAccountConfirm')} required error={errors.confirm_bank_account}>
                {(p) => <Input {...p} type="text" inputMode="numeric" value={form.confirm_bank_account}
                  onChange={(e) => set({ confirm_bank_account: e.target.value.replace(/\D/g, '').slice(0, 18) })} />}
              </Field>
              <Field label={t('reg.ifsc')} error={errors.ifsc} hint={t('reg.ifscHint')}>
                {(p) => <Input {...p} type="text" placeholder="SBIN0001234" style={{ textTransform: 'uppercase' }}
                  value={form.ifsc} onChange={(e) => set({ ifsc: e.target.value.toUpperCase() })} />}
              </Field>
            </>
          ) : null}

          {isRetailer ? (
            <>
              <h2 className="reg-section">{t('reg.business')}</h2>
              <Field label={t('reg.businessName')} required error={errors.business_name}>
                {(p) => <Input {...p} type="text" placeholder="Sri Murugan Provisions"
                  value={form.business_name} onChange={(e) => set({ business_name: e.target.value })} />}
              </Field>
              <Field label={t('reg.gst')} error={errors.gst_number} hint={t('reg.gstHint')}>
                {(p) => <Input {...p} type="text" maxLength={15} placeholder="33AABCU9603R1ZX"
                  style={{ textTransform: 'uppercase' }} value={form.gst_number}
                  onChange={(e) => set({ gst_number: e.target.value.toUpperCase() })} />}
              </Field>
              <Field label={t('reg.businessType')}>
                {(p) => (
                  <Select {...p} value={form.business_type} onChange={(e) => set({ business_type: e.target.value })}>
                    <option value="">{t('reg.selectType')}</option>
                    {BUSINESS_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </Select>
                )}
              </Field>
            </>
          ) : null}

          {/* ── Security ── */}
          <h2 className="reg-section">{t('reg.security')}</h2>
          <Field label={t('reg.password')} required error={errors.password}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password}
              onChange={(e) => set({ password: e.target.value })} />}
          </Field>
          <ul className="pw-rules">
            {pwRules.map((r) => (
              <li key={r.id} className={r.met ? 'pw-rule met' : 'pw-rule'}>
                <span aria-hidden="true">{r.met ? '✓' : '○'}</span> {r.label}
              </li>
            ))}
          </ul>
          <Field label={t('reg.confirmPassword')} required error={errors.confirm_password}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm_password}
              onChange={(e) => set({ confirm_password: e.target.value })} />}
          </Field>

          {/* ── Plan (sellers only) ── */}
          {isSeller ? (
            <>
              <h2 className="reg-section">{t('reg.plan')}</h2>
              <Field label={t('reg.choosePlan')} required error={errors.subscription_plan}>
                {(p) => (
                  <Select {...p} value={form.subscription_plan}
                    onChange={(e) => set({ subscription_plan: e.target.value })}>
                    <option value="">{t('reg.selectPlan')}</option>
                    {SUBSCRIPTION_PLANS.map((pl) => (
                      <option key={pl.name} value={pl.name}>
                        {pl.name} — ₹{pl.amountRs} / {pl.days} {t('reg.days')}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              {quote ? (
                <div className="reg-fees">
                  <div className="reg-fee-row">
                    <span>{t('reg.regCharge')}</span><span>₹{quote.registrationChargeRs}</span>
                  </div>
                  <div className="reg-fee-row">
                    <span>{quote.plan.name} {t('reg.subscription')}</span><span>₹{quote.planFeeRs}</span>
                  </div>
                  {quote.discountRs > 0 ? (
                    <div className="reg-fee-row concession">
                      <span>🌸 {t('reg.concession', { pct: quote.concessionPct })}</span>
                      <span>− ₹{quote.discountRs}</span>
                    </div>
                  ) : null}
                  <div className="reg-fee-row total">
                    <span>{t('reg.totalPayable')}</span><span>₹{quote.totalRs}</span>
                  </div>
                  <p className="reg-fee-note">{t('reg.payAfterApproval')}</p>
                </div>
              ) : null}
            </>
          ) : null}

          <Button type="submit" block disabled={busy}>
            {busy ? t('reg.creating') : isSeller ? t('reg.submitSeller') : t('reg.submitConsumer')}
          </Button>

          <div className="auth-links">
            <Link className="auth-link muted" to="/login">{t('login.backToLogin')}</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function RoleButton({ on, icon, label, onClick }: {
  on: boolean; icon: string; label: string; onClick: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={on}
      className={`reg-role ${on ? 'on' : ''}`} onClick={onClick}>
      <span className="reg-role-icon" aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

/** A seller cannot sign in yet, so there is nowhere to send them — show the
 *  login ID they'll be approved under and let them out to the sign-in page. */
function PendingPanel({ loginId }: { loginId: string }) {
  const { t } = useTranslation();
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="reg-done-icon" aria-hidden="true">🎉</div>
        <h1>{t('reg.pendingTitle')}</h1>
        <p className="reg-done-body">{t('reg.pendingBody')}</p>
        <div className="reg-loginid">
          <span>{t('reg.yourLoginId')}</span>
          <b>{loginId}</b>
        </div>
        <p className="reg-done-body">{t('reg.pendingNext')}</p>
        <Link to="/login" style={{ textDecoration: 'none' }}>
          <Button block>{t('reg.goToLogin')}</Button>
        </Link>
      </div>
    </div>
  );
}
