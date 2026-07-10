import { cn } from './lib/cn';

export interface StarRatingProps {
  /** Stars currently filled (0–5). */
  value: number;
  /** Omit to render a static, non-interactive rating. */
  onRate?: (stars: number) => void;
  disabled?: boolean;
  /** Accessible name for the radio group, e.g. the product name. */
  label?: string;
}

const STARS = [1, 2, 3, 4, 5];

const lit = (on: boolean) => (on ? 'text-sun' : 'text-neutral-300');

/**
 * Five-star input. Readonly (no `onRate`) collapses to plain text for screen
 * readers instead of five unlabelled buttons.
 */
export function StarRating({ value, onRate, disabled = false, label }: StarRatingProps) {
  if (!onRate) {
    return (
      <span className="inline-flex items-center gap-0.5 leading-none" role="img" aria-label={`Rated ${value} out of 5`}>
        {STARS.map((s) => (
          <span key={s} aria-hidden="true" className={cn('text-xl', lit(s <= value))}>
            {s <= value ? '★' : '☆'}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-0.5 leading-none"
      role="radiogroup"
      aria-label={label ? `Rate ${label}` : 'Rate this item'}
    >
      {STARS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={s === value}
          aria-label={`${s} star${s > 1 ? 's' : ''}`}
          disabled={disabled}
          className={cn(
            'appearance-none border-0 bg-transparent p-0.5 text-2xl leading-none cursor-pointer rounded-xs',
            'disabled:cursor-default',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-leaf',
            lit(s <= value),
          )}
          onClick={() => onRate(s)}
        >
          {s <= value ? '★' : '☆'}
        </button>
      ))}
    </span>
  );
}
