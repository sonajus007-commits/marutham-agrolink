import { useTranslation } from 'react-i18next';
import { StatTile } from '@marutham/ui';
import { fmtMoney, type AgentStats } from '@marutham/lib';

export function StatsRow({ stats, isVCO }: { stats: AgentStats | null; isVCO: boolean }) {
  const { t } = useTranslation();
  const dash = '—';
  return (
    <div className="agent-stats">
      <StatTile
        label={isVCO ? t('agent.stat.toVerify') : t('agent.stat.inQueue')}
        value={stats ? stats.queue : dash}
      />
      <StatTile
        label={isVCO ? t('agent.stat.verified') : t('agent.stat.delivered')}
        value={stats ? stats.completed : dash}
      />
      <StatTile
        label={isVCO ? t('agent.stat.inPipeline') : t('agent.stat.cod')}
        value={stats ? stats.codOrPipeline : isVCO ? dash : fmtMoney(0)}
      />
    </div>
  );
}
