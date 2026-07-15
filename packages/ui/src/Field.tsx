import { useId, type ReactNode } from 'react';

/* The labelled form control, on Tailwind — the last of the `.ma-field*` classes.
 *
 * The label and error strings are exported so screens that render a bare label,
 * a <legend>, or a standalone error message (outside a <Field>) can match this
 * one without re-deriving the type scale. Error text is the semantic `danger`
 * token, the same red <Input> turns its border on an invalid field. */

export const FIELD_LABEL_CLASS = 'block text-[11px] font-bold text-forest mb-1.5';
export const FIELD_ERR_CLASS = 'mt-1 text-[11px] text-danger';
const FIELD_HINT_CLASS = 'mt-1 text-[10px] text-fg-muted';

export interface FieldProps {
  label: ReactNode;
  required?: boolean;
  /** Validation message; also wires aria-invalid + aria-describedby. */
  error?: string | null;
  hint?: ReactNode;
  /** Receives the id/aria props to spread onto the control. */
  children: (props: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}

/**
 * Labelled form control. Owns the label↔control association and the aria wiring
 * for errors and hints, so no screen at any role has to remember it.
 */
export function Field({ label, required = false, error, hint, children }: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="mb-3">
      <label className={FIELD_LABEL_CLASS} htmlFor={id}>
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children({
        id,
        ...(error ? { 'aria-invalid': true } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {hint ? (
        <div id={hintId} className={FIELD_HINT_CLASS}>
          {hint}
        </div>
      ) : null}
      {error ? (
        <div id={errId} className={FIELD_ERR_CLASS} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
