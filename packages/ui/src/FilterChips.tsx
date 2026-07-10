import { cn } from './lib/cn';

export interface ChipOption {
  value: string;
  label: string;
}

/* Preflight is off, so `appearance-none border-0 font-sans` still has to be said
 * out loud on every <button>. See packages/ui/README.md. */
const CHIP =
  'appearance-none cursor-pointer whitespace-nowrap font-sans text-sm font-bold ' +
  'rounded-pill px-3 py-1.5 border-[1.5px] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-leaf';

export function FilterChips({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            className={cn(
              CHIP,
              on
                ? 'bg-success-bg border-leaf text-primary shadow-[inset_0_0_0_1px_var(--leaf)]'
                : 'bg-surface border-surface-muted text-fg-muted',
            )}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
