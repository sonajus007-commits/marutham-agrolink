export interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
}

export function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <div className="flex flex-col gap-1.5 bg-surface border border-border-subtle rounded-base shadow-base px-5 py-[18px]">
      <span className="text-sm font-bold tracking-wide uppercase text-fg-muted">{label}</span>
      <span className="text-4xl font-bold text-primary leading-tight">{value}</span>
      {hint ? <span className="text-base text-fg-muted">{hint}</span> : null}
    </div>
  );
}
