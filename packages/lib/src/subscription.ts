/* Subscription plan catalogue — MIRRORS backend/utils/subscriptionPlans.js.
 *
 * The server is the authority and recomputes the amount on every quote and
 * every payment (`/subscription/plans`, `/subscription/pay`); it never trusts a
 * figure from the client. This copy exists for ONE reason: the registration
 * form is PRE-LOGIN and `/subscription/*` sits behind requireAuth, so an
 * applicant cannot be quoted from the API before their account exists. Once
 * they're in, SubscriptionGate reads the real numbers from the server.
 *
 * Amounts are RUPEES here; the backend catalogue stores PAISE.
 *
 * Keep the discount formula identical to the server's `discountedAmount()` —
 * payable = round(base × (100 − pct) / 100) — so the quote shown at signup can
 * never drift from the amount actually charged after approval. */

export const REGISTRATION_CHARGE_RS = 100; // one-time, first activation only
export const CONCESSION_PCT = 10; // women & transgender sellers, plan fee only

export interface SubscriptionPlan {
  name: string;
  days: number;
  amountRs: number;
}

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  { name: 'Monthly', days: 30, amountRs: 200 },
  { name: 'Quarterly', days: 90, amountRs: 550 },
  { name: 'Half Yearly', days: 180, amountRs: 1100 },
  { name: 'Yearly', days: 365, amountRs: 2000 },
];

export function getSubscriptionPlan(name: string): SubscriptionPlan | null {
  return SUBSCRIPTION_PLANS.find((p) => p.name === name) || null;
}

/** The concession percentage this applicant qualifies for (0 when none). */
export function concessionFor(gender?: string | null): number {
  return gender === 'Female' || gender === 'Transgender' ? CONCESSION_PCT : 0;
}

export interface RegistrationQuote {
  plan: SubscriptionPlan;
  /** List price of the plan, before any concession. */
  planFeeRs: number;
  concessionPct: number;
  discountRs: number;
  planPayableRs: number;
  /** The one-time ₹100 — charged at first activation, never on renewal. */
  registrationChargeRs: number;
  totalRs: number;
}

/**
 * What a new seller will owe once Head Office approves them: the one-time
 * registration charge plus their chosen plan, less any concession.
 * Returns null for an unknown/unselected plan.
 */
export function quoteRegistration(planName: string, gender?: string | null): RegistrationQuote | null {
  const plan = getSubscriptionPlan(planName);
  if (!plan) return null;

  const concessionPct = concessionFor(gender);
  const planPayableRs = Math.round((plan.amountRs * (100 - concessionPct)) / 100);

  return {
    plan,
    planFeeRs: plan.amountRs,
    concessionPct,
    discountRs: plan.amountRs - planPayableRs,
    planPayableRs,
    registrationChargeRs: REGISTRATION_CHARGE_RS,
    totalRs: REGISTRATION_CHARGE_RS + planPayableRs,
  };
}
