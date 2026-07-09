export function EmptyState({ icon, children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="ma-empty">
      {icon ? <div className="ma-empty__icon">{icon}</div> : null}
      <div>{children}</div>
    </div>
  );
}
