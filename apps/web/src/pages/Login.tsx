import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { useAuth } from '../auth/AuthContext';

type Mode = 'password' | 'otp' | 'forgot';

export function Login() {
  const { t } = useTranslation();
  const { login, loginWithOtp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('password');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sent, setSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(''); setOk(''); setSent(false); setDevOtp(null);
    setOtp(''); setPassword(''); setNewPassword(''); setConfirm('');
  }

  async function guard(fn: () => Promise<void>) {
    setError(''); setOk(''); setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error'));
    } finally {
      setBusy(false);
    }
  }

  const onPasswordLogin = (e: FormEvent) => { e.preventDefault(); void guard(async () => {
    await login(phone.trim(), password);
    navigate('/', { replace: true });
  }); };

  const onSendOtp = (e: FormEvent) => { e.preventDefault(); void guard(async () => {
    if (!phone.trim()) { setError(t('login.needPhone')); return; }
    const res = await api.sendOtp(phone.trim());
    setSent(true);
    setDevOtp(res.otp || null);
  }); };

  const onVerifyOtp = (e: FormEvent) => { e.preventDefault(); void guard(async () => {
    await loginWithOtp(phone.trim(), otp.trim());
    navigate('/', { replace: true });
  }); };

  const onReset = (e: FormEvent) => { e.preventDefault(); void guard(async () => {
    if (newPassword.length < 6) { setError(t('login.pwShort')); return; }
    if (newPassword !== confirm) { setError(t('login.pwMismatch')); return; }
    await api.resetPassword(phone.trim(), otp.trim(), newPassword);
    switchMode('password');
    setOk(t('login.resetOk'));
  }); };

  const title = mode === 'forgot' ? t('login.forgotTitle') : mode === 'otp' ? t('login.otpTitle') : t('login.title');

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>{title}</h1>
        <p className="sub">{t('brand')}</p>

        {mode !== 'forgot' ? (
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'password'} className={`auth-tab ${mode === 'password' ? 'active' : ''}`} onClick={() => switchMode('password')}>{t('login.passwordTab')}</button>
            <button type="button" role="tab" aria-selected={mode === 'otp'} className={`auth-tab ${mode === 'otp' ? 'active' : ''}`} onClick={() => switchMode('otp')}>{t('login.otpTab')}</button>
          </div>
        ) : null}

        {error ? <div className="form-error" role="alert">{error}</div> : null}
        {ok ? <div className="auth-ok" role="status">{ok}</div> : null}
        {sent && devOtp ? <div className="auth-hint">{t('login.sandboxOtp')}: <b>{devOtp}</b></div> : null}

        {/* ── Password login ── */}
        {mode === 'password' ? (
          <form onSubmit={onPasswordLogin}>
            <Phone value={phone} onChange={setPhone} label={t('login.phone')} />
            <div className="field">
              <label htmlFor="password">{t('login.password')}</label>
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" block disabled={busy}>{busy ? t('login.loading') : t('login.submit')}</Button>
            <div className="auth-links">
              <button type="button" className="auth-link" onClick={() => switchMode('forgot')}>{t('login.forgot')}</button>
            </div>
          </form>
        ) : null}

        {/* ── OTP login ── */}
        {mode === 'otp' ? (
          !sent ? (
            <form onSubmit={onSendOtp}>
              <p className="auth-sub-step">{t('login.otpIntro')}</p>
              <Phone value={phone} onChange={setPhone} label={t('login.phone')} />
              <Button type="submit" block disabled={busy}>{busy ? t('login.sending') : t('login.sendOtp')}</Button>
            </form>
          ) : (
            <form onSubmit={onVerifyOtp}>
              <p className="auth-sub-step">{t('login.otpSent', { phone })}</p>
              <Code value={otp} onChange={setOtp} label={t('login.otpLabel')} />
              <Button type="submit" block disabled={busy}>{busy ? t('login.verifying') : t('login.verify')}</Button>
              <div className="auth-links">
                <button type="button" className="auth-link muted" onClick={() => { setSent(false); setOtp(''); setDevOtp(null); }}>{t('login.resend')}</button>
              </div>
            </form>
          )
        ) : null}

        {/* ── Forgot password ── */}
        {mode === 'forgot' ? (
          !sent ? (
            <form onSubmit={onSendOtp}>
              <p className="auth-sub-step">{t('login.forgotIntro')}</p>
              <Phone value={phone} onChange={setPhone} label={t('login.phone')} />
              <Button type="submit" block disabled={busy}>{busy ? t('login.sending') : t('login.sendOtp')}</Button>
              <div className="auth-links">
                <button type="button" className="auth-link muted" onClick={() => switchMode('password')}>{t('login.backToLogin')}</button>
              </div>
            </form>
          ) : (
            <form onSubmit={onReset}>
              <p className="auth-sub-step">{t('login.otpSent', { phone })}</p>
              <Code value={otp} onChange={setOtp} label={t('login.otpLabel')} />
              <div className="field">
                <label htmlFor="np">{t('login.newPassword')}</label>
                <input id="np" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="cp">{t('login.confirmPassword')}</label>
                <input id="cp" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <Button type="submit" block disabled={busy}>{busy ? t('login.resetting') : t('login.reset')}</Button>
              <div className="auth-links">
                <button type="button" className="auth-link muted" onClick={() => { setSent(false); setOtp(''); setDevOtp(null); }}>{t('login.resend')}</button>
                <button type="button" className="auth-link muted" onClick={() => switchMode('password')}>{t('login.backToLogin')}</button>
              </div>
            </form>
          )
        ) : null}
      </div>
    </div>
  );
}

function Phone({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="field">
      <label htmlFor="phone">{label}</label>
      <input id="phone" type="tel" inputMode="numeric" autoComplete="username" value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))} required />
    </div>
  );
}

function Code({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="field">
      <label htmlFor="otp">{label}</label>
      <input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
    </div>
  );
}
