import type { ReactNode } from 'react';
import { ChartContainer, type ChartContainerProps } from './ChartContainer';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';

/* A geographic map tile — a <ChartContainer> with two map-specific extras:
 *
 *  - a drill breadcrumb (country → state → district → …), which is exactly the
 *    <Breadcrumbs> trail, so the last level is the current map and the earlier
 *    ones drill back out; and
 *  - a choropleth legend: the sequential ramp the map is shaded with, as an
 *    accessible HTML scale rather than the one ECharts paints inside the canvas
 *    where a screen reader can't reach it.
 *
 * Like ChartContainer it holds no map — the ECharts/GeoJSON map is `children`.
 * The legend `stops` are passed in (from `sequential` in @marutham/tokens, the
 * same ramp handed to ECharts' visualMap), so this component stays palette-
 * agnostic and light/dark is the caller's choice of ramp. */

export interface ChoroplethLegend {
  /** Colour stops, low→high value — the same ramp given to the map's visualMap. */
  stops: readonly string[];
  /** Label at the low end of the scale (e.g. "0"). */
  min: ReactNode;
  /** Label at the high end (e.g. "1,200"). */
  max: ReactNode;
  /** What the shading measures, e.g. "Farmers per district". */
  label?: ReactNode;
}

export interface MapContainerProps extends Omit<ChartContainerProps, 'subtitle' | 'footer'> {
  /** Drill path; the last crumb is the current map and is not a link. */
  drillPath?: Crumb[];
  legend?: ChoroplethLegend;
  /** A line under the title, when there is no drill path to show there instead. */
  subtitle?: ReactNode;
}

function Legend({ stops, min, max, label }: ChoroplethLegend) {
  const text =
    'Scale' +
    (label ? ' for ' + String(label) : '') +
    ', low ' +
    String(min) +
    ' to high ' +
    String(max);
  return (
    <div>
      {label ? (
        <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-fg-muted">{label}</div>
      ) : null}
      {/* One labelled image to the AT; the swatches and end labels are decorative. */}
      <div role="img" aria-label={text}>
        <div className="flex h-2.5 overflow-hidden rounded-pill" aria-hidden="true">
          {stops.map((color, i) => (
            <span key={i} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
        <div
          aria-hidden="true"
          className="mt-1 flex justify-between text-2xs tabular-nums text-fg-muted"
        >
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}

export function MapContainer({ drillPath, legend, subtitle, ...rest }: MapContainerProps) {
  return (
    <ChartContainer
      {...rest}
      subtitle={drillPath && drillPath.length ? <Breadcrumbs items={drillPath} /> : subtitle}
      footer={legend ? <Legend {...legend} /> : undefined}
    />
  );
}
