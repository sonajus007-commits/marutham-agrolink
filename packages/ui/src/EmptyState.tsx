import type { ReactNode } from 'react';

export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="text-center px-5 py-8 text-md text-fg-muted">
      {icon ? <div className="text-[40px] mb-3">{icon}</div> : null}
      <div>{children}</div>
    </div>
  );
}
