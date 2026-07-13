import { useTranslation } from 'react-i18next';
import { Card, KpiCard } from '@marutham/ui';
import { chartPalette, colors } from '@marutham/tokens';
import type { EChartsOption } from 'echarts';
import { useAuth } from '../auth/AuthContext';
import { EChart } from '../components/EChart';

/* Phase 0 proof screen. Renders REAL /auth/me data (loaded by AuthProvider)
 * plus one ECharts chart styled with the brand palette — demonstrating the full
 * pipeline: build → serve under /app → auth → API → charts → tokens → i18n. */
export function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const fullName = [user?.fname, user?.lname].filter(Boolean).join(' ') || user?.login_id || '—';

  const option: EChartsOption = {
    // ONE series → slot 0. `.light` is named, not inferred: there is no theme
    // switcher yet, so every chart renders on the light surface. When dark is bound,
    // this is the line that chooses — the dark array is its own steps, not a flip.
    color: [chartPalette.light[0]],
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 24, bottom: 28 },
    xAxis: {
      type: 'category',
      data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      axisLine: { lineStyle: { color: colors.border } },
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: colors.muted } } },
    series: [
      {
        name: 'Sample',
        type: 'bar',
        data: [120, 160, 140, 180, 220, 260, 210],
        itemStyle: { borderRadius: [6, 6, 0, 0] },
      },
    ],
  };

  return (
    <div className="page">
      <h1 className="page__title">{t('dashboard.proofTitle')}</h1>
      <p className="page__sub">{t('dashboard.proofNote')}</p>

      <div className="kpi-row">
        <KpiCard label={t('dashboard.welcome')} value={fullName} hint={String(user?.login_id ?? '')} />
        <KpiCard label={t('dashboard.role')} value={String(user?.admin_role || user?.role || '—')} />
        <KpiCard label={t('dashboard.status')} value={String(user?.status ?? '—')} />
      </div>

      <div className="stack">
        <Card>
          <h2 style={{ fontSize: 15, color: colors.forest, marginBottom: 12 }}>
            {t('dashboard.chartTitle')}
          </h2>
          <EChart option={option} />
        </Card>
      </div>
    </div>
  );
}
