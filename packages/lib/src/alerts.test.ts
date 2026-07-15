import { describe, it, expect } from 'vitest';
import { sortAlerts, alertTone, type DashboardAlert } from './alerts';

describe('sortAlerts', () => {
  const a = (severity: string, type: string): DashboardAlert => ({
    severity,
    type,
    message: `${type} (${severity})`,
  });

  it('puts the most urgent action item first — the list is worked top-down', () => {
    const alerts = [a('low', 'assign'), a('medium', 'returns'), a('high', 'delayed_payment')];
    expect(sortAlerts(alerts).map((x) => x.severity)).toEqual(['high', 'medium', 'low']);
  });

  it('keeps the server order within a severity, so like alerts stay together', () => {
    const alerts = [a('medium', 'returns'), a('medium', 'farmer_approval'), a('high', 'pay')];
    expect(sortAlerts(alerts).map((x) => x.type)).toEqual(['pay', 'returns', 'farmer_approval']);
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

describe('alertTone', () => {
  it('means the same thing on every dashboard that shows an alert', () => {
    expect(alertTone('high')).toBe('danger');
    expect(alertTone('medium')).toBe('warning');
    expect(alertTone('low')).toBe('neutral');
    expect(alertTone(undefined)).toBe('neutral');
  });
});
