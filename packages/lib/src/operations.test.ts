import { describe, it, expect } from 'vitest';
import {
  deliveryStages, totalInPipeline, rankedOpsDistricts, sortAlerts, opsAlertTone,
  type OpsAlert, type OpsDistrict,
} from './operations';

describe('deliveryStages', () => {
  it('orders the bars along the pipeline, not by whatever key order the API sent', () => {
    // The server builds status_breakdown by iterating orders, so this key order
    // is realistic — and meaningless.
    const breakdown = {
      Delivered: 9,
      Packaged: 4,
      'Out for Delivery': 2,
      'Order Placed': 7,
      'VCO Verified': 1,
    };
    expect(deliveryStages(breakdown).map((s) => s.status)).toEqual([
      'Order Placed', 'Packaged', 'VCO Verified', 'Out for Delivery', 'Delivered',
    ]);
  });

  it('keeps a status the pipeline has never heard of — those orders are real', () => {
    const stages = deliveryStages({ Delivered: 1, Quarantined: 3, Packaged: 2 });
    expect(stages.map((s) => s.status)).toEqual([
      'Packaged', 'Delivered', 'Quarantined',
    ]);
    expect(stages.find((s) => s.status === 'Quarantined')?.count).toBe(3);
  });

  it('sorts multiple unknown statuses alphabetically rather than at random', () => {
    const stages = deliveryStages({ Zebra: 1, Aardvark: 1, Packaged: 1 });
    expect(stages.map((s) => s.status)).toEqual(['Packaged', 'Aardvark', 'Zebra']);
  });

  it('survives an empty or missing breakdown', () => {
    expect(deliveryStages({})).toEqual([]);
    expect(deliveryStages(undefined)).toEqual([]);
  });
});

describe('totalInPipeline', () => {
  it('counts everything that is not yet Delivered', () => {
    const stages = deliveryStages({ 'Order Placed': 7, Packaged: 4, Delivered: 9 });
    expect(totalInPipeline(stages)).toBe(11);
  });

  it('is zero when everything is delivered', () => {
    expect(totalInPipeline(deliveryStages({ Delivered: 12 }))).toBe(0);
  });
});

describe('rankedOpsDistricts', () => {
  const d = (district: string, orders: number): OpsDistrict => ({
    district, orders, revenue: orders * 10, pending: 1,
  });

  it('sorts busiest first and does not mutate the input', () => {
    const input = [d('A', 3), d('B', 11), d('C', 7)];
    expect(rankedOpsDistricts(input).map((x) => x.district)).toEqual(['B', 'C', 'A']);
    expect(input.map((x) => x.district)).toEqual(['A', 'B', 'C']);
  });

  it('survives no districts', () => {
    expect(rankedOpsDistricts(null)).toEqual([]);
  });
});

describe('sortAlerts', () => {
  const a = (severity: string, type: string): OpsAlert => ({
    severity, type, message: `${type} (${severity})`,
  });

  it('puts the most urgent action item first — the manager works this top-down', () => {
    const alerts = [a('low', 'assign'), a('medium', 'returns'), a('high', 'delayed_payment')];
    expect(sortAlerts(alerts).map((x) => x.severity)).toEqual(['high', 'medium', 'low']);
  });

  it('keeps the server order within a severity, so like alerts stay together', () => {
    const alerts = [a('medium', 'returns'), a('medium', 'farmer_approval'), a('high', 'pay')];
    expect(sortAlerts(alerts).map((x) => x.type)).toEqual([
      'pay', 'returns', 'farmer_approval',
    ]);
  });

  it('sinks an unknown severity below the known ones rather than dropping it', () => {
    const alerts = [a('cosmic', 'weird'), a('low', 'assign')];
    expect(sortAlerts(alerts).map((x) => x.type)).toEqual(['assign', 'weird']);
  });

  it('does not mutate the input, and survives none', () => {
    const alerts = [a('low', 'x'), a('high', 'y')];
    sortAlerts(alerts);
    expect(alerts.map((x) => x.type)).toEqual(['x', 'y']);
    expect(sortAlerts(undefined)).toEqual([]);
  });
});

describe('opsAlertTone', () => {
  it('means the same thing here as on the executive dashboard', () => {
    expect(opsAlertTone('high')).toBe('danger');
    expect(opsAlertTone('medium')).toBe('warning');
    expect(opsAlertTone('low')).toBe('neutral');
    expect(opsAlertTone(undefined)).toBe('neutral');
  });
});
