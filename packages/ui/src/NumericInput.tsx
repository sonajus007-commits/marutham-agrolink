import { cn } from './lib/cn';

/* Large numeric entry for field capture — the VCO's weight/quantity input, where
 * the actual figure has to be big, thumb-friendly, and quick to correct. Renders
 * oversized tabular digits with big −/+ steppers on either side, an optional unit
 * suffix (kg), and reports the parsed number (or null when the field is cleared).
 *
 * Distinct from <QtyStepper> (a compact cart quantity, integers only): this is a
 * full-width capture control that accepts decimals and shows the value at display
 * size so a number read off a scale is unmistakable. */

export interface NumericInputProps {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  label?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

export function NumericInput({
  id,
  value,
  onChange,
  label,
  unit,
  min = 0,
  max,
  step = 0.1,
  className,
}: NumericInputProps) {
  const clamp = (n: number) => {
    let v = n;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    // Avoid float drift from repeated ±step.
    return Math.round(v * 1000) / 1000;
  };
  const bump = (dir: 1 | -1) => onChange(clamp((value ?? 0) + dir * step));

  const stepBtn =
    'flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-md border border-surface-muted bg-surface font-sans text-2xl font-bold text-forest ' +
    'transition-colors active:translate-y-px enabled:hover:bg-success-bg ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={id} className="text-2xs font-bold tracking-wider text-fg-muted uppercase">
          {label}
        </label>
      ) : null}
      <div className="flex items-stretch gap-2">
        <button type="button" className={stepBtn} onClick={() => bump(-1)} aria-label="Decrease">
          −
        </button>
        <div className="flex flex-1 items-baseline justify-center gap-1 rounded-md border border-surface-muted bg-surface px-2">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            value={value ?? ''}
            min={min}
            max={max}
            step={step}
            aria-label={label ?? unit ?? 'Value'}
            onChange={(e) => onChange(e.target.value === '' ? null : clamp(Number(e.target.value)))}
            className="w-full min-w-0 border-0 bg-transparent text-center font-sans text-4xl font-extrabold text-fg tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit ? <span className="text-lg font-bold text-fg-muted">{unit}</span> : null}
        </div>
        <button type="button" className={stepBtn} onClick={() => bump(1)} aria-label="Increase">
          +
        </button>
      </div>
    </div>
  );
}
