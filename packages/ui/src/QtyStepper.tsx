import { useState, useEffect } from 'react';

export interface QtyStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  /** Round to whole numbers on blur (for non-decimal units). */
  integer?: boolean;
}

export function QtyStepper({ value, onChange, min = 0, step = 1, unit, disabled, integer }: QtyStepperProps) {
  // Local text state lets the user type freely without the value snapping mid-edit.
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const round = (n: number) => Math.round(n * 100) / 100;

  function commit(raw: string) {
    let n = parseFloat(raw);
    if (isNaN(n)) {
      setText(String(value));
      return;
    }
    if (integer) n = Math.round(n);
    if (n < min) n = min;
    onChange(round(n));
  }

  return (
    <div className="ma-qty">
      <button
        type="button"
        className="ma-qty__btn"
        onClick={() => onChange(round(Math.max(min, value - step)))}
        disabled={disabled}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <input
        className="ma-qty__input"
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        aria-label="Quantity"
      />
      <button
        type="button"
        className="ma-qty__btn"
        onClick={() => onChange(round(value + step))}
        disabled={disabled}
        aria-label="Increase quantity"
      >
        +
      </button>
      {unit ? <span className="ma-qty__unit">{unit}</span> : null}
    </div>
  );
}
