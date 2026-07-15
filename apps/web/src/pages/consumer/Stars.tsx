export function Stars({ value, count }: { value: number; count?: number }) {
  const filled = Math.round(value);
  const str = '★★★★★☆☆☆☆☆'.slice(5 - filled, 10 - filled);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span className="stars" aria-hidden="true">
        {str}
      </span>
      <span style={{ fontSize: 10, color: 'var(--gray)' }}>
        {value.toFixed(1)}
        {count != null ? ` (${count})` : ''}
      </span>
    </span>
  );
}
