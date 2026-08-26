'use client';

/* The sign-in overlay that opens ON the home page.
 *
 * The whole point (per the brief): clicking "Sign in" must NOT navigate away to
 * a separate-looking /app/login page. It opens here, over the home page, and
 * closing returns you to the same URL. So this is a modal, not a route.
 *
 * It talks to the SAME backend the portal does (POST /api/auth/login) and writes
 * the SAME origin-scoped session keys (`ma_token` / `ma_user`) the Vite portal
 * reads on boot — see packages/api-client/src/session.ts. On success it hands off
 * to /app/, whose <RoleHome> routes each role to its own dashboard, so NONE of
 * the role-routing logic is duplicated here.
 *
 * The complex flows — OTP login, forgot-password, the 90-day reset routing — stay
 * in the one place that owns them (the portal's full /app/login). When a login is
 * refused for a password-policy reason, or the visitor wants OTP, we send them
 * there rather than reimplementing it. */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { Lang } from '@/lib/dict';

const PORTAL_HOME = '/app/';
const PORTAL_LOGIN = '/app/login';
const PORTAL_REGISTER = '/app/register';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Welcome back',
    subtitle: 'Sign in to your Marutham AgroLink account',
    idLabel: 'Phone number or Login ID',
    idPlaceholder: 'e.g. 9876543210',
    pwLabel: 'Password',
    pwPlaceholder: 'Your password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    otp: 'Sign in with OTP',
    forgot: 'Forgot password?',
    noAccount: 'New to Marutham?',
    createAccount: 'Create an account',
    close: 'Close',
    genericError: 'Could not sign in. Check your details and try again.',
    needReset: 'Continue to secure sign-in',
  },
  ta: {
    title: 'மீண்டும் வரவேற்கிறோம்',
    subtitle: 'உங்கள் மருதம் அக்ரோலிங்க் கணக்கில் உள்நுழையவும்',
    idLabel: 'தொலைபேசி எண் அல்லது உள்நுழைவு ஐடி',
    idPlaceholder: 'எ.கா. 9876543210',
    pwLabel: 'கடவுச்சொல்',
    pwPlaceholder: 'உங்கள் கடவுச்சொல்',
    submit: 'உள்நுழைய',
    submitting: 'உள்நுழைகிறது…',
    otp: 'OTP மூலம் உள்நுழைய',
    forgot: 'கடவுச்சொல் மறந்துவிட்டதா?',
    noAccount: 'மருதத்திற்கு புதியவரா?',
    createAccount: 'கணக்கை உருவாக்கவும்',
    close: 'மூடு',
    genericError: 'உள்நுழைய முடியவில்லை. விவரங்களைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
    needReset: 'பாதுகாப்பான உள்நுழைவுக்குச் செல்லவும்',
  },
};

interface Props {
  lang: Lang;
  onClose: () => void;
}

export function LoginModal({ lang, onClose }: Props) {
  const c = COPY[lang] ?? COPY.en;
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsPortal, setNeedsPortal] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  // Esc closes; lock body scroll while the overlay is up; focus the first field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstField.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNeedsPortal(false);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A password-policy refusal (must_reset / expired / locked) needs the
        // portal's reset flow — send them there rather than failing silently.
        if (data && typeof data === 'object' && 'password_action' in data) {
          setNeedsPortal(true);
        }
        setError((data && (data.error || data.message)) || c.genericError);
        return;
      }
      try {
        localStorage.setItem('ma_token', data.token);
        localStorage.setItem('ma_user', JSON.stringify(data.user));
      } catch {
        /* private-mode / storage-blocked: fall through to the portal login */
        window.location.href = PORTAL_LOGIN;
        return;
      }
      // Hand off to the portal, which routes each role to its own home.
      window.location.href = PORTAL_HOME;
    } catch {
      setError(c.genericError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={c.close}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-forest-900/45 backdrop-blur-sm"
      />

      {/* Card */}
      <div className="animate-[loginPop_.22s_ease-out] bg-surface relative z-10 w-full max-w-md overflow-hidden rounded-3xl shadow-[0_24px_80px_rgba(22,61,47,0.35)]">
        {/* Brand band */}
        <div className="from-forest-700 to-forest-900 flex items-center gap-3 bg-gradient-to-br px-8 pt-8 pb-6">
          {/* Static brand asset; next/image adds no benefit for a fixed-size mark. */}
          <img
            src="/brand/mark.png"
            alt=""
            aria-hidden="true"
            className="h-11 w-11 rounded-xl bg-white p-0.5"
          />
          <div className="leading-tight">
            <h2 id="login-modal-title" className="text-surface font-serif text-2xl font-bold">
              {c.title}
            </h2>
            <p className="text-leaf-300 text-caption">{c.subtitle}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={c.close}
          className="text-surface/80 hover:bg-surface/15 hover:text-surface absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <form onSubmit={onSubmit} className="flex flex-col gap-4 px-8 py-7">
          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
              {needsPortal ? (
                <a
                  href={PORTAL_LOGIN}
                  className="text-forest-700 mt-1 block font-semibold underline underline-offset-2"
                >
                  {c.needReset} →
                </a>
              ) : null}
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-forest-900 text-caption font-semibold">{c.idLabel}</span>
            <input
              ref={firstField}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="username"
              placeholder={c.idPlaceholder}
              className="border-border focus:border-forest-700 focus:ring-forest-700/20 w-full rounded-xl border px-4 py-3 text-body outline-none transition focus:ring-4"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-forest-900 text-caption font-semibold">{c.pwLabel}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder={c.pwPlaceholder}
              className="border-border focus:border-forest-700 focus:ring-forest-700/20 w-full rounded-xl border px-4 py-3 text-body outline-none transition focus:ring-4"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="bg-forest-700 text-surface hover:bg-forest-900 mt-1 inline-flex items-center justify-center rounded-full px-7 py-3.5 font-semibold shadow-[0_2px_10px_rgba(22,61,47,0.18)] transition-all duration-200 hover:shadow-[0_8px_24px_rgba(22,61,47,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? c.submitting : c.submit}
          </button>

          <div className="flex items-center justify-between text-caption">
            <a
              href={`${PORTAL_LOGIN}?mode=otp`}
              className="text-forest-700 font-medium hover:underline"
            >
              {c.otp}
            </a>
            <a href={`${PORTAL_LOGIN}?mode=forgot`} className="text-fg-muted hover:text-forest-700">
              {c.forgot}
            </a>
          </div>

          <div className="border-border text-fg-muted mt-1 border-t pt-4 text-center text-caption">
            {c.noAccount}{' '}
            <a href={PORTAL_REGISTER} className="text-forest-700 font-semibold hover:underline">
              {c.createAccount}
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
