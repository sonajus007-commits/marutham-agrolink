import { useState } from 'react';
import { Button, Card, Field, FIELD_ERR_CLASS } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { isStrongPassword } from '@marutham/lib';
import { useToast } from './Toast';
import { PasswordInput, PasswordRules } from './PasswordInput';

/**
 * Shared "Change Password" card — used by the consumer and seller profiles.
 * Lives in components/ (not a role page) because both portals render it. Styled
 * with the design-system primitives so it carries no legacy page CSS.
 */
export function ChangePasswordCard() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setCurrent('');
    setNext('');
    setError(null);
  }

  async function submit() {
    if (!current) return setError('Enter your current password.');
    // The client is stricter than the server's 6-char floor, on purpose.
    if (!isStrongPassword(next)) return setError('New password does not meet the requirements.');
    if (next === current) return setError('New password must differ from the current one.');
    setError(null);
    setBusy(true);
    try {
      await api.changePassword(current, next);
      toast('Password changed successfully.', 'ok');
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-3 text-md font-bold text-primary">🔒 Change Password</h3>
      {!open ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>🔒 Change Password</Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Current Password">
            {(p) => (
              <PasswordInput {...p} value={current} onChange={setCurrent}
                placeholder="Your current password" autoComplete="current-password" />
            )}
          </Field>

          <Field label="New Password">
            {(p) => (
              <>
                <PasswordInput {...p} value={next} onChange={setNext}
                  placeholder="New strong password" autoComplete="new-password" />
                <PasswordRules value={next} />
              </>
            )}
          </Field>

          {/* Form-level: the fault may be the current password, the new one, or the server. */}
          {error ? <div className={FIELD_ERR_CLASS} role="alert">{error}</div> : null}

          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy}>{busy ? 'Updating…' : 'Update Password'}</Button>
            <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
