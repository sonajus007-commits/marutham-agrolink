import { describe, it, expect } from 'vitest';
import {
  TREND_MODES, DISTRICT_ALIAS, geoDistrictName, dbDistrictName, findDistrict,
  districtTone, alertTone, growthDirection, formatGrowth, rankedDistricts,
  placeholderGroups, humanizeMetricKey,
  type DistrictPerf,
} from './executive';

const d = (district: string, revenue: number, status?: string): DistrictPerf => ({
  district, revenue, orders: 1, status,
});

describe('district name aliasing', () => {
  it('translates the two names the DB and the GeoJSON spell differently', () => {
    expect(geoDistrictName('Kanniyakumari')).toBe('Kanyakumari');
    expect(geoDistrictName('The Nilgiris')).toBe('Nilgiris');
    expect(dbDistrictName('Kanyakumari')).toBe('Kanniyakumari');
    expect(dbDistrictName('Nilgiris')).toBe('The Nilgiris');
  });

  it('passes every other district through untouched', () => {
    expect(geoDistrictName('Pudukkottai')).toBe('Pudukkottai');
    expect(dbDistrictName('Pudukkottai')).toBe('Pudukkottai');
  });

  it('round-trips — a mismatch silently greys out a real district on the map', () => {
    for (const [db, geo] of Object.entries(DISTRICT_ALIAS)) {
      expect(dbDistrictName(geo)).toBe(db);
      expect(geoDistrictName(db)).toBe(geo);
    }
  });
});

describe('findDistrict', () => {
  const districts = [d('Pudukkottai', 100), d('Kanniyakumari', 50)];

  it('finds a district from the name a MAP CLICK gives (GeoJSON spelling)', () => {
    expect(findDistrict(districts, 'Kanyakumari')?.district).toBe('Kanniyakumari');
  });

  it('finds a district from the DB spelling too (a ranking-list click)', () => {
    expect(findDistrict(districts, 'Kanniyakumari')?.district).toBe('Kanniyakumari');
    expect(findDistrict(districts, 'Pudukkottai')?.district).toBe('Pudukkottai');
  });

  it('is case-insensitive, and returns null for a district with no data', () => {
    expect(findDistrict(districts, 'pudukkottai')?.revenue).toBe(100);
    expect(findDistrict(districts, 'Chennai')).toBeNull();
  });
});

describe('districtTone / alertTone', () => {
  it('maps the backend bands onto the design system status roles', () => {
    expect(districtTone('green')).toBe('success');
    expect(districtTone('amber')).toBe('warning');
    expect(districtTone('red')).toBe('danger');
  });

  it('falls back to neutral for an unknown or missing band — never a fake status', () => {
    expect(districtTone(undefined)).toBe('neutral');
    expect(districtTone('purple')).toBe('neutral');
  });

  it('maps alert severity the same way', () => {
    expect(alertTone('high')).toBe('danger');
    expect(alertTone('medium')).toBe('warning');
    expect(alertTone('low')).toBe('neutral');
  });
});

describe('growth', () => {
  it('treats 0 as flat, not as growth', () => {
    expect(growthDirection(0)).toBe('flat');
    expect(formatGrowth(0)).toBe('0%');
  });

  it('always signs the number, so a drop cannot read as a gain', () => {
    expect(growthDirection(16.7)).toBe('up');
    expect(formatGrowth(16.7)).toBe('+16.7%');
    expect(growthDirection(-28.6)).toBe('down');
    expect(formatGrowth(-28.6)).toBe('−28.6%'); // U+2212, not a hyphen
  });

  it('survives null/undefined', () => {
    expect(growthDirection(null)).toBe('flat');
    expect(formatGrowth(undefined)).toBe('0%');
  });
});

describe('rankedDistricts', () => {
  it('sorts richest first and does not mutate the input', () => {
    const input = [d('A', 10), d('B', 90), d('C', 50)];
    expect(rankedDistricts(input).map((x) => x.district)).toEqual(['B', 'C', 'A']);
    expect(input.map((x) => x.district)).toEqual(['A', 'B', 'C']);
  });

  it('survives no districts', () => {
    expect(rankedDistricts(null)).toEqual([]);
    expect(rankedDistricts([])).toEqual([]);
  });
});

describe('placeholderGroups', () => {
  it('groups the reported metrics by theme, in display order', () => {
    const groups = placeholderGroups([
      'fuel_cost', 'net_profit', 'hub_issues', 'salary_cost', 'ebitda',
    ]);
    // Finance before cost before logistics before satisfaction — regardless of
    // the order the API happened to list them in.
    expect(groups.map((g) => g.id)).toEqual(['finance', 'cost', 'logistics', 'satisfaction']);
    expect(groups[0].metrics.map((m) => m.key)).toEqual(['net_profit', 'ebitda']);
    expect(groups[0].metrics[0].icon).toBe('💵');
  });

  it('renders every metric the API reports and no metric it does not', () => {
    // The API array is the source of truth: a key it omits must not appear
    // (that drift is exactly what the hardcoded-3-tiles version got wrong).
    const groups = placeholderGroups(['net_profit']);
    expect(groups.flatMap((g) => g.metrics).map((m) => m.key)).toEqual(['net_profit']);
  });

  it('keeps an uncatalogued key instead of silently dropping it', () => {
    const groups = placeholderGroups(['net_profit', 'churn_risk']);
    const other = groups.find((g) => g.id === 'other');
    expect(other?.metrics).toEqual([{ key: 'churn_risk', icon: '🔌' }]);
  });

  it('is empty when the backend reports nothing missing', () => {
    expect(placeholderGroups([])).toEqual([]);
    expect(placeholderGroups(undefined)).toEqual([]);
  });
});

describe('humanizeMetricKey', () => {
  it('is the label of last resort for an untranslated key', () => {
    expect(humanizeMetricKey('vehicle_utilization')).toBe('Vehicle Utilization');
    expect(humanizeMetricKey('gst')).toBe('Gst');
  });
});

describe('TREND_MODES', () => {
  it('matches what the endpoint accepts (?trend=)', () => {
    expect(TREND_MODES).toEqual(['monthly', 'quarterly', 'yearly']);
  });
});
