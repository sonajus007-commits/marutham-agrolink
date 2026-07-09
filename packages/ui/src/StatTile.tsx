export interface StatTileProps {
  icon?: string;
  label: string;
  value: string | number;
  hint?: string | null;
  /** Optional accent colour applied to the value. */
  accent?: string;
}

export function StatTile({ icon, label, value, hint, accent }: StatTileProps) {
  return (
    <div className="ma-stat">
      <div className="ma-stat__val" style={accent ? { color: accent } : undefined}>
        {icon ? <span aria-hidden="true">{icon} </span> : null}
        {value}
      </div>
      <div className="ma-stat__lbl">{label}</div>
      {hint ? <div className="ma-stat__hint">{hint}</div> : null}
    </div>
  );
}
