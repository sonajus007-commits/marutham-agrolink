import { useTranslation } from 'react-i18next';
import { StatTile } from '@marutham/ui';
import { fmtMoney, type AgentStats } from '@marutham/lib';

export function StatsRow({
  stats,
  isVCO,
  onNavigate,
}: {
  stats: AgentStats | null;
  isVCO: boolean;
  /** A count tile is a shortcut into its list; the money tile (agent COD) has no
   *  list, so it stays a plain, non-selectable tile. */
  onNavigate: (tab: 'work' | 'done') => void;
}) {
  const { t } = useTranslation();
  const dash = '—';
  return (
    <div className="agent-stats">
      {/* To Verify / In Queue — the active work waiting on them → Work tab. */}
      <StatTile
        label={isVCO ? t('agent.stat.toVerify') : t('agent.stat.inQueue')}
        value={stats ? stats.queue : dash}
        onClick={() => onNavigate('work')}
      />
      {/* Verified / Delivered — what they've finished → Done tab. */}
      <StatTile
        label={isVCO ? t('agent.stat.verified') : t('agent.stat.delivered')}
        value={stats ? stats.completed : dash}
        onClick={() => onNavigate('done')}
      />
      {/* VCO: orders in the pipeline → Work. Agent: COD collected is money, not a
          list, so it is left non-selectable. */}
      <StatTile
        label={isVCO ? t('agent.stat.inPipeline') : t('agent.stat.cod')}
        value={stats ? stats.codOrPipeline : isVCO ? dash : fmtMoney(0)}
        onClick={isVCO ? () => onNavigate('work') : undefined}
      />
    </div>
  );
}
