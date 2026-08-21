import type { AgentStats } from '@marutham/lib';
import type { FieldDashboardResponse } from '@marutham/api-client';
import { StatsRow } from './StatsRow';
import { FieldDashboard } from './FieldDashboard';

/* Overview page — the field worker's at-a-glance dashboard: who they are, the
 * headline counts, and the tile-based field dashboard. No order actions live
 * here; those are on the Delivery Tracking / Collections page. */
export function AgentOverview({
  name,
  sub,
  clock,
  stats,
  isVCO,
  field,
  onNavigate,
}: {
  name: string;
  sub: string;
  clock: string;
  stats: AgentStats | null;
  isVCO: boolean;
  field: { data: FieldDashboardResponse | null; reload: () => void };
  /** Jump to another section — a count tile is a shortcut into its list. */
  onNavigate: (tab: 'work' | 'done') => void;
}) {
  return (
    <>
      <div className="agent-id">
        <div>
          <div className="agent-id__name">{name}</div>
          <div className="agent-id__sub">{sub}</div>
        </div>
        <div>
          <div className="agent-clock">{clock}</div>
        </div>
      </div>

      <StatsRow stats={stats} isVCO={isVCO} onNavigate={onNavigate} />

      <FieldDashboard data={field.data} onRefresh={field.reload} onNavigate={onNavigate} />
    </>
  );
}
