export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex justify-center p-7" role="status" aria-live="polite">
      <div className="size-[30px] rounded-full border-[3px] border-surface-muted border-t-leaf animate-spin-ring" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
