export interface ChipOption {
  value: string;
  label: string;
}

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
    <div className="ma-chips" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`ma-chip ${o.value === value ? 'on' : ''}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
