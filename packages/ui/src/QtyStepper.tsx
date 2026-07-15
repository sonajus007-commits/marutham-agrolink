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

const BTN =
  'size-[34px] appearance-none cursor-pointer rounded-[9px] border-[1.5px] border-tint-300 ' +
  'bg-surface text-[18px] font-bold text-leaf ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-leaf';

export function QtyStepper({
  value,
  onChange,
  min = 0,
  step = 1,
  unit,
  disabled,
  integer,
}: QtyStepperProps) {
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
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        className={BTN}
        onClick={() => onChange(round(Math.max(min, value - step)))}
        disabled={disabled}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <input
        className="w-14 rounded-[9px] border-[1.5px] border-tint-300 bg-surface px-1 py-[7px] text-center font-sans text-lg font-bold text-primary outline-none focus:border-leaf"
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
        className={BTN}
        onClick={() => onChange(round(value + step))}
        disabled={disabled}
        aria-label="Increase quantity"
      >
        +
      </button>
      {unit ? <span className="text-sm text-fg-muted">{unit}</span> : null}
    </div>
  );
}
