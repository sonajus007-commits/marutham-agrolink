import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Input, cn } from '@marutham/ui';
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
    <div className="relative flex">
      <Input
        {...aria}
        id={id}
        className="pr-11"
        type={shown ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer appearance-none rounded-xs border-0 bg-transparent p-1.5 text-sm leading-none text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-leaf"
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
  const { t } = useTranslation();
  return (
    <ul className="m-0 mt-2 list-none p-0">
      {passwordRuleResults(value).map((r) => (
        <li
          key={r.id}
          className={cn(
            'flex items-center gap-[7px] py-0.5 text-2xs',
            r.met ? 'text-success' : 'text-fg-muted',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              r.met ? 'bg-success' : 'bg-neutral-300',
            )}
            aria-hidden="true"
          />
          {/* The rule's `id` is already a code; `label` is its English default. */}
          <span>{t(`pwd.rule.${r.id}`, r.label)}</span>
          <span className="sr-only">
            {r.met ? ` — ${t('pwd.rule.met', 'met')}` : ` — ${t('pwd.rule.notMet', 'not met')}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
