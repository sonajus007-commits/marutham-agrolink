import type { ReactNode } from 'react';
import { cn } from './lib/cn';

/* The language segmented control shared by the mobile role headers. Replaces
 * `.ma-lang` and its buttons. Presentational only: the caller owns the i18n
 * (`value` = current language, `onChange` switches it). Each option may carry a
 * `className` for a script-specific font, e.g. the Tamil `.tamil` face. */

export interface LangOption {
  value: string;
  label: ReactNode;
  /** Extra class on this option's button (e.g. a script font). */
  className?: string;
}

export interface LangToggleProps {
  value: string;
  options: LangOption[];
  onChange: (value: string) => void;
  'aria-label'?: string;
}

const LANG_BTN =
  'cursor-pointer rounded-lg border border-tint-300 bg-surface font-sans ' +
  'px-[9px] py-[5px] text-[11px] font-bold text-fg-muted ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-leaf';

export function LangToggle({ value, options, onChange, ...rest }: LangToggleProps) {
  return (
    <div className="inline-flex gap-1" role="group" aria-label={rest['aria-label']}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cn(LANG_BTN, o.className, o.value === value && 'border-leaf bg-success-bg text-forest')}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
