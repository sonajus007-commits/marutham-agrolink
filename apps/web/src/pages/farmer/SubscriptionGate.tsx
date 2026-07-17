import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Modal, Spinner, FIELD_LABEL_CLASS, FIELD_ERR_CLASS } from '@marutham/ui';
import { api, type SubscriptionPlan, type SubscriptionPlansResponse } from '@marutham/api-client';
import { fmtMoney } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';

/**
 * Subscription payment gate.
 *
 * `blocking` — a suspended seller cannot dismiss it; paying is the only way
 * into the app. Renewal opens the same dialog, dismissible.
 *
 * Every money value here is a rupee string from the API (backend/utils/money.js).
 * Never divide by 100: the legacy gate did, and advertised a ₹300 activation as
 * "Pay ₹2 & Activate".
 */
/* Plan NAMES are the value the server prices off (`paySubscription(plan.name)`),
 * and a closed set of four — so they get a key each and the value is untouched. */
const planKey = (name: string) => `farmer.sub.plan.${name.replace(/\s+/g, '').toLowerCase()}`;

export function SubscriptionGate({
  open,
  blocking,
  onClose,
  onPaid,
}: {
  open: boolean;
  blocking: boolean;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { t } = useTranslation();
  const { updateUser } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<SubscriptionPlansResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setData(null);
    setError(null);
    setSelected(null);
    api
      .getSubscriptionPlans()
      .then((d) => active && setData(d))
      .catch(
        (e) =>
          active &&
          setError(
            e instanceof Error ? e.message : t('farmer.sub.loadFailed', 'Could not load plans'),
          ),
      );
    return () => {
      active = false;
    };
  }, [open]);

  const plan = data?.plans.find((p) => p.name === selected) || null;
  const regCharge = data?.registration_charge_applies ? Number(data.registration_charge) : 0;
  const total = plan ? Number(plan.amount) + regCharge : 0;

  async function pay() {
    if (!plan) return;
    setBusy(true);
    try {
      // Only the plan NAME crosses the wire. The server prices it.
      const res = await api.paySubscription(plan.name);
      updateUser(res.user);
      toast(
        t('farmer.sub.paid', 'Paid {{amount}} — your account is active.', {
          amount: fmtMoney(res.amount_paid),
        }),
        'ok',
      );
      onPaid();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('farmer.sub.payFailed', 'Payment failed');
      setError(msg);
      toast(msg, 'er');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      dismissible={!blocking}
      onClose={onClose}
      closeLabel={t('common.close', 'Close')}
      title={
        blocking
          ? `🔒 ${t('farmer.sub.activate', 'Activate Your Account')}`
          : `🔄 ${t('farmer.sub.renew', 'Renew Subscription')}`
      }
      subtitle={
        blocking
          ? t('farmer.sub.activateSub', 'Choose a plan and pay to start selling your produce.')
          : t('farmer.sub.renewSub', 'Extend your subscription to keep selling.')
      }
      footer={
        data ? (
          <>
            {!blocking ? (
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                {t('farmer.sub.later', 'Later')}
              </Button>
            ) : null}
            <Button onClick={pay} disabled={!plan || busy}>
              {busy
                ? t('farmer.sub.processing', 'Processing…')
                : plan
                  ? t('farmer.sub.payCta', 'Pay {{amount}} & Activate', { amount: fmtMoney(total) })
                  : t('farmer.sub.selectPlan', 'Select a plan')}
            </Button>
          </>
        ) : null
      }
    >
      {error && !data ? (
        <p className={FIELD_ERR_CLASS} role="alert">
          {error}
        </p>
      ) : !data ? (
        <Spinner />
      ) : (
        <>
          {data.concession_pct > 0 ? (
            <p className="sub-concession">
              🌸{' '}
              <Trans
                i18nKey="farmer.sub.concession"
                values={{ pct: data.concession_pct }}
                defaults="<1>Women & Transgender concession:</1> {{pct}}% off the plan fee, already applied below."
                components={{ 1: <strong /> }}
              />
            </p>
          ) : null}

          <fieldset className="sub-plans">
            <legend className={FIELD_LABEL_CLASS}>{t('farmer.sub.choose', 'Choose a plan')}</legend>
            {data.plans.map((p) => (
              <PlanOption
                key={p.name}
                plan={p}
                checked={selected === p.name}
                onSelect={() => setSelected(p.name)}
              />
            ))}
          </fieldset>

          {plan ? (
            <div className="sub-summary">
              <div className="sub-summary__row">
                <span>{t('farmer.sub.planFee', 'Plan fee')}</span>
                <span>{fmtMoney(plan.amount)}</span>
              </div>
              {regCharge > 0 ? (
                <div className="sub-summary__row">
                  <span>
                    {t('farmer.sub.regCharge', 'Registration charge')}{' '}
                    <small>({t('farmer.sub.oneTime', 'one-time')})</small>
                  </span>
                  <span>{fmtMoney(data.registration_charge)}</span>
                </div>
              ) : null}
              <div className="sub-summary__row sub-summary__row--total">
                <span>{t('farmer.sub.totalPayable', 'Total payable')}</span>
                <span>{fmtMoney(total)}</span>
              </div>
            </div>
          ) : null}

          {!data.registration_charge_applies ? (
            <p className="sub-note">
              ✓{' '}
              {t(
                'farmer.sub.regPaid',
                'Your one-time registration charge is already paid — renewals are plan fee only.',
              )}
            </p>
          ) : null}

          {error ? (
            <p className={FIELD_ERR_CLASS} role="alert" style={{ marginTop: 8 }}>
              {error}
            </p>
          ) : null}
        </>
      )}
    </Modal>
  );
}

function PlanOption({
  plan,
  checked,
  onSelect,
}: {
  plan: SubscriptionPlan;
  checked: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  // Both are rupee strings, so a plain !== is a string compare — equal means no
  // concession. The legacy page compared 20000 with "200.00" and always struck through.
  const discounted = plan.base_amount !== plan.amount;

  return (
    <label className={`sub-plan${checked ? ' is-on' : ''}`}>
      <input type="radio" name="subplan" checked={checked} onChange={onSelect} />
      <span className="sub-plan__main">
        <span className="sub-plan__name">{t(planKey(plan.name), plan.name)}</span>
        <span className="sub-plan__days">
          {t('farmer.sub.validity', '{{days}} days validity', { days: plan.days })}
        </span>
      </span>
      <span className="sub-plan__price">
        {discounted ? <s>{fmtMoney(plan.base_amount)}</s> : null}
        {fmtMoney(plan.amount)}
      </span>
    </label>
  );
}
