import { useId, type ReactNode } from 'react';

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
    <div className="ma-field">
      <label className="ma-field__label" htmlFor={id}>
        {label}
        {required ? <span className="ma-field__req" aria-hidden="true"> *</span> : null}
      </label>
      {children({
        id,
        ...(error ? { 'aria-invalid': true } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {hint ? <div id={hintId} className="ma-field__hint">{hint}</div> : null}
      {error ? <div id={errId} className="ma-field__err" role="alert">{error}</div> : null}
    </div>
  );
}
