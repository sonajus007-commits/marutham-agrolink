import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartContainer, StatTile } from '@marutham/ui';
import { api, type HubDashboardResponse, type HubFlowMetrics } from '@marutham/api-client';
import { fmtMoney, fmtNum } from '@marutham/lib';
import { chartPalette, colors } from '@marutham/tokens';
import type { EChartsOption } from 'echarts';
import { EChart } from '../../components/EChart';
import { PlaceholderSection } from '../../components/PlaceholderSection';
import { CheckCircleDuo, ClockDuo, PackageDuo, TruckDuo, WalletDuo } from '../../components/icons';

/**
 * The per-hub in/out attribution dashboard (Hub Management, Phase 3). Reads the
 * pickup_hub_id / delivery_hub_id stamped on every order (Phase 2):
 *   IN  — orders whose seller is in this hub's taluk (goods entering the network here)
 *   OUT — orders delivered into this hub's taluk      (goods leaving for the door here)
 *
 * The SERVER picks the scope from the caller: a Hub Manager sees only their own hub
 * (scope.level 'hub'), a District Manager sees every taluk hub in their district
 * rolled up ('district'). There is no scope parameter to pass or tamper with.
 * `revenue` is already RUPEES (see HubDashboardResponse) — fmtMoney it directly.
 */
export function HubDashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<HubDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getHubDashboard());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the hub dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDistrict = data?.scope.level === 'district';

  // A single-series count-by-status bar, shared by the IN and OUT charts. ONE series
  // → ONE colour; the bar length is the message, so colour is not spent re-encoding
  // the axis label. (Same rationale as the Overview status chart.)
  const statusOption = useCallback(
    (breakdown: Record<string, number> | undefined): EChartsOption => {
      const entries = Object.entries(breakdown ?? {});
      return {
        color: [chartPalette.light[0]],
        tooltip: { trigger: 'item' },
        grid: { left: 40, right: 16, top: 20, bottom: 28 },
        xAxis: {
          type: 'category',
          data: entries.map(([s]) => s),
          axisLabel: { interval: 0, fontSize: 10, fontWeight: 'bold' },
          axisLine: { lineStyle: { color: colors.border } },
        },
        yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: colors.muted } } },
        series: [
          {
            type: 'bar',
            data: entries.map(([, n]) => n),
            itemStyle: { borderRadius: [6, 6, 0, 0] },
            label: { show: true, position: 'top', fontSize: 11, color: colors.gray },
          },
        ],
      };
    },
    [],
  );

  const inStatusOption = useMemo(() => statusOption(data?.in_status), [statusOption, data]);
  const outStatusOption = useMemo(() => statusOption(data?.out_status), [statusOption, data]);
  const inStatusEmpty = Object.keys(data?.in_status ?? {}).length === 0;
  const outStatusEmpty = Object.keys(data?.out_status ?? {}).length === 0;

  // A Hub Manager with no hub, or a District Manager with no district, has nothing
  // to show — say so plainly rather than render zeroed tiles.
  const emptyScope =
    !loading &&
    !error &&
    data != null &&
    ((data.scope.level === 'hub' && data.hubs.length === 0) ||
      (data.scope.level === 'district' && !data.scope.district));

  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-primary">{t('admin.hubDash.title')}</h1>
      <p className="mb-3 text-sm text-fg-muted">
        {isDistrict ? t('admin.hubDash.subtitleDistrict') : t('admin.hubDash.subtitleHub')}
      </p>
      <p className="mb-4 text-sm text-fg-muted">
        {t('admin.hubDash.scope')}:{' '}
        <span className="font-semibold text-fg">{data?.scope.name || '—'}</span>
      </p>

      {error ? (
        <div className="rounded-lg border border-danger bg-danger-bg p-4 text-sm text-danger-fg">
          {error}
        </div>
      ) : emptyScope ? (
        <div className="rounded-lg border border-subtle bg-surface-muted p-4 text-sm text-fg-muted">
          {data?.scope.level === 'hub' ? t('admin.hubDash.noHub') : t('admin.hubDash.noDistrict')}
        </div>
      ) : (
        <>
          {/* Incoming — goods entering the network through this hub's taluk. */}
          <h2 className="mb-2 text-sm font-bold text-fg">
            📥 {t('admin.hubDash.in')}
            <span className="ml-2 font-normal text-fg-muted">{t('admin.hubDash.inHint')}</span>
          </h2>
          <FlowTiles t={t} m={data?.totals.in} />

          {/* Outgoing — goods leaving for the door in this hub's taluk. */}
          <h2 className="mb-2 mt-6 text-sm font-bold text-fg">
            📤 {t('admin.hubDash.out')}
            <span className="ml-2 font-normal text-fg-muted">{t('admin.hubDash.outHint')}</span>
          </h2>
          <FlowTiles t={t} m={data?.totals.out} />

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ChartContainer
              title={t('admin.hubDash.statusIn')}
              loading={loading}
              empty={!loading && inStatusEmpty ? t('admin.hubDash.noStatus') : false}
              height={260}
            >
              <EChart option={inStatusOption} height={260} />
            </ChartContainer>
            <ChartContainer
              title={t('admin.hubDash.statusOut')}
              loading={loading}
              empty={!loading && outStatusEmpty ? t('admin.hubDash.noStatus') : false}
              height={260}
            >
              <EChart option={outStatusOption} height={260} />
            </ChartContainer>
          </div>

          {/* Per-hub roll-up — only meaningful for a district (multiple hubs). */}
          {isDistrict && (data?.hubs.length ?? 0) > 0 ? (
            <div className="mt-6">
              <ChartContainer title={t('admin.hubDash.byHub')} loading={loading} height="auto">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-subtle text-left">
                        <th className="py-2 pr-4 font-bold text-fg">
                          {t('admin.hubDash.table.hub')}
                        </th>
                        <th className="py-2 pr-4 text-right font-bold text-fg">
                          {t('admin.hubDash.table.inActive')}
                        </th>
                        <th className="py-2 pr-4 text-right font-bold text-fg">
                          {t('admin.hubDash.table.inTotal')}
                        </th>
                        <th className="py-2 pr-4 text-right font-bold text-fg">
                          {t('admin.hubDash.table.outActive')}
                        </th>
                        <th className="py-2 text-right font-bold text-fg">
                          {t('admin.hubDash.table.outTotal')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.hubs.map((h) => (
                        <tr key={h.id} className="border-b border-subtle">
                          <td className="py-2 pr-4 text-fg">{h.name}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-fg-muted">
                            {fmtNum(h.in.active)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-fg-muted">
                            {fmtNum(h.in.count)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-fg-muted">
                            {fmtNum(h.out.active)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-fg-muted">
                            {fmtNum(h.out.count)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartContainer>
            </div>
          ) : null}
        </>
      )}

      <div className="mt-6">
        <PlaceholderSection
          placeholders={data?.placeholders}
          title={t('admin.hubDash.ph.title')}
          subtitle={t('admin.hubDash.ph.sub')}
          loading={loading && !data}
        />
      </div>
    </>
  );
}

/** The five-tile row that describes one flow (incoming or outgoing). */
function FlowTiles({ t, m }: { t: (k: string) => string; m: HubFlowMetrics | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatTile
        icon={<PackageDuo />}
        tone="green"
        label={t('admin.hubDash.kpi.total')}
        value={m ? fmtNum(m.count) : '—'}
      />
      <StatTile
        icon={<TruckDuo />}
        tone="green"
        label={t('admin.hubDash.kpi.active')}
        value={m ? fmtNum(m.active) : '—'}
        accent="var(--info)"
      />
      <StatTile
        icon={<CheckCircleDuo />}
        tone="leaf"
        label={t('admin.hubDash.kpi.delivered')}
        value={m ? fmtNum(m.delivered) : '—'}
      />
      <StatTile
        icon={<ClockDuo />}
        tone="pink"
        label={t('admin.hubDash.kpi.today')}
        value={m ? fmtNum(m.today) : '—'}
      />
      <StatTile
        icon={<WalletDuo />}
        tone="gold"
        label={t('admin.hubDash.kpi.revenue')}
        value={m ? fmtMoney(m.revenue) : '—'}
        accent="var(--success)"
      />
    </div>
  );
}
