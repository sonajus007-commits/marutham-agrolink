import { describe, it, expect } from 'vitest';
import {
  deliveryStages, totalInPipeline, rankedOpsDistricts,
  type OpsDistrict,
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
