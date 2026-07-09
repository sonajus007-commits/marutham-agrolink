import { useState } from 'react';
import { passwordRuleResults } from '@marutham/lib';

/** Password box with a reveal toggle. `id`/aria props come from <Field>. */
export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  ...aria
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="ma-pw">
      <input
        {...aria}
        id={id}
        className="ma-input"
        type={shown ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="ma-pw__eye"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? '🙈' : '👁'}
      </button>
    </div>
  );
}

/**
 * Live strength checklist. aria-live is intentionally omitted: announcing all
 * four rules on every keystroke is noise. The submit-time error is the alert.
 */
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="ma-pwrules">
      {passwordRuleResults(value).map((r) => (
        <li key={r.id} className={r.met ? 'is-met' : ''}>
          <span className="ma-pwrules__dot" aria-hidden="true" />
          <span>{r.label}</span>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            {r.met ? ' — met' : ' — not met'}
          </span>
        </li>
      ))}
    </ul>
  );
}
