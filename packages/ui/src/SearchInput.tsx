import { Search } from 'lucide-react';
import { cn } from './lib/cn';

/* A search box: a magnifier and a `type="search"` input (so the browser draws
 * its own clear affordance and mobile keyboards show a Search key).
 *
 * Extracted from <Table>, its first caller. Controlled and logic-free — it holds
 * no query and does no filtering; the caller owns the value and decides what to
 * do with it. <Table> feeds it to `filterRows` in @marutham/lib.
 *
 * Preflight is off, so `appearance-none` resets the input. The focus ring is a
 * box-shadow, not an outline, so it hugs the rounded corners. */

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Names the field. Defaults to the placeholder — set one or the other. */
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchInput({
  value, onChange, placeholder = 'Search…', 'aria-label': ariaLabel, disabled, className,
}: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={14}
        aria-hidden="true"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        disabled={disabled}
        className={
          'w-full appearance-none rounded-sm border-[1.5px] border-border-strong bg-surface ' +
          'pl-8 pr-3 py-2 font-sans text-sm text-fg outline-none ' +
          'focus:border-leaf focus:shadow-[0_0_0_3px_var(--focus-ring)] ' +
          'disabled:cursor-not-allowed disabled:opacity-55'
        }
      />
    </div>
  );
}
