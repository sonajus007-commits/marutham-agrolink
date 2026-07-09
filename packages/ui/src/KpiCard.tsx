export interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
}

export function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <div className="ma-kpi">
      <span className="ma-kpi__label">{label}</span>
      <span className="ma-kpi__value">{value}</span>
      {hint ? <span className="ma-kpi__hint">{hint}</span> : null}
    </div>
  );
}
