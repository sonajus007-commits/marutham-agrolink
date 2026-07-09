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

/**
 * Five-star input. Readonly (no `onRate`) collapses to plain text for screen
 * readers instead of five unlabelled buttons.
 */
export function StarRating({ value, onRate, disabled = false, label }: StarRatingProps) {
  if (!onRate) {
    return (
      <span className="ma-stars" role="img" aria-label={`Rated ${value} out of 5`}>
        {STARS.map((s) => (
          <span key={s} aria-hidden="true" className={s <= value ? 'on' : ''}>{s <= value ? '★' : '☆'}</span>
        ))}
      </span>
    );
  }

  return (
    <span className="ma-stars ma-stars--input" role="radiogroup" aria-label={label ? `Rate ${label}` : 'Rate this item'}>
      {STARS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={s === value}
          aria-label={`${s} star${s > 1 ? 's' : ''}`}
          disabled={disabled}
          className={s <= value ? 'on' : ''}
          onClick={() => onRate(s)}
        >
          {s <= value ? '★' : '☆'}
        </button>
      ))}
    </span>
  );
}
