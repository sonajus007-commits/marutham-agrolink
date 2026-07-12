import { useEffect, useState } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { semantic, colors } from '@marutham/tokens';
import { geoDistrictName, districtTone, fmtMoneyFull, type DistrictPerf } from '@marutham/lib';

/* The Tamil Nadu district choropleth.
 *
 * Two things worth knowing before you trust this map:
 *
 * 1. It is TAMIL NADU ONLY, but the business runs in six states (Andhra
 *    Pradesh, Karnataka, Kerala, Puducherry, Tamil Nadu, Telangana). A district
 *    outside TN has revenue but no shape to paint, so it CANNOT appear here.
 *    The ranking list beside the map is the complete picture — that is why it is
 *    always rendered, and why it is not decoration.
 *
 * 2. The DB and the GeoJSON disagree on two spellings (Kanniyakumari/Kanyakumari,
 *    The Nilgiris/Nilgiris). ECharts does not error on a name it cannot match —
 *    it just paints the district grey, as if it had no sales. `geoDistrictName`
 *    is the fix, and packages/lib tests it.
 *
 * The 102KB of GeoJSON is imported dynamically so only this route pays for it;
 * the admin bundle is already code-split per page.
 */

const MAP_NAME = 'tamilnadu';
let registered = false;

/** Status is STATE, not identity — so it wears the design system's status roles
 *  and never a categorical series colour, and it always ships with the legend's
 *  text labels beside it, never colour alone. */
const TONE_FILL: Record<string, string> = {
  success: semantic.light.success,
  warning: semantic.light.warning,
  danger: semantic.light.danger,
  neutral: colors.muted,
};

export type MapState = 'loading' | 'ready' | 'unavailable';

export function TnDistrictMap({
  districts,
  onSelect,
  height = 380,
  onStateChange,
}: {
  districts: DistrictPerf[];
  onSelect?: (dbDistrict: string) => void;
  height?: number;
  onStateChange?: (s: MapState) => void;
}) {
  const [state, setState] = useState<MapState>(registered ? 'ready' : 'loading');

  useEffect(() => {
    let alive = true;
    if (registered) {
      onStateChange?.('ready');
      return;
    }
    import('../assets/tn-districts.geo.json')
      .then((mod) => {
        if (!alive) return;
        echarts.registerMap(MAP_NAME, (mod.default ?? mod) as never);
        registered = true;
        setState('ready');
        onStateChange?.('ready');
      })
      .catch((e) => {
        // A map that will not load must not take the section down: the caller
        // still renders the ranking list, which carries the same numbers.
        console.error('[TnDistrictMap] GeoJSON failed to load:', e);
        if (!alive) return;
        setState('unavailable');
        onStateChange?.('unavailable');
      });
    return () => {
      alive = false;
    };
  }, [onStateChange]);

  if (state !== 'ready') return null;

  const data = districts.map((d) => ({
    name: geoDistrictName(d.district),
    value: Number(d.revenue || 0),
    orders: Number(d.orders || 0),
    itemStyle: { areaColor: TONE_FILL[districtTone(d.status)] },
  }));

  const option: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (p: unknown) => {
        const q = p as { name: string; data?: { value?: number; orders?: number } };
        if (!q.data) return `${q.name}<br/>No sales`;
        // Same formatter as the ranking list — the map and its table view must
        // never disagree about a number.
        return `<strong>${q.name}</strong><br/>Revenue: ${fmtMoneyFull(q.data.value ?? 0)}<br/>Orders: ${q.data.orders ?? 0}`;
      },
    },
    series: [
      {
        type: 'map',
        map: MAP_NAME,
        nameProperty: 'district',
        roam: true,
        // A district with no sales stays the surface tint — absence must not
        // read as a status band.
        itemStyle: { areaColor: colors.muted, borderColor: colors.border, borderWidth: 0.6 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: colors.sage } },
        select: { itemStyle: { areaColor: colors.sage } },
        data,
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      notMerge
      lazyUpdate
      onEvents={{
        click: (p: { name?: string }) => {
          if (p?.name && onSelect) onSelect(p.name);
        },
      }}
    />
  );
}
