export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="ma-spinner" role="status" aria-live="polite">
      <div className="ma-spinner__ring" />
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {label}
      </span>
    </div>
  );
}
