import { describe, it, expect } from 'vitest';
import { buildPipeline, PIPELINE_STAGES } from './pipeline';
import { isStrongPassword, passwordRuleResults, PASSWORD_RULES } from './password';
import { buildAddress, resolveAddress, statusColor, fmtMoney } from './format';

describe('buildPipeline', () => {
  it('marks stages before the current one done, and the current one active', () => {
    const nodes = buildPipeline('hub', 'Picked Up');
    const byLabel = Object.fromEntries(nodes.map((n) => [n.label, n.status]));
    expect(byLabel['Order Placed']).toBe('done');
    expect(byLabel['Picked Up']).toBe('active');
    expect(byLabel['Delivered']).toBe('pending');
  });

  it('a hub route keeps the hub-only stages', () => {
    const nodes = buildPipeline('hub', 'Picked Up');
    expect(nodes.filter((n) => n.skipped)).toHaveLength(0);
  });

  it('a direct route bypasses In Transit and At Hub', () => {
    const nodes = buildPipeline('direct', 'Picked Up');
    expect(nodes.filter((n) => n.skipped).map((n) => n.label)).toEqual(['In Transit', 'At Hub']);
  });

  it('treats a null route as direct', () => {
    expect(buildPipeline(null, 'Packaged').filter((n) => n.skipped)).toHaveLength(2);
  });

  it('leaves every stage pending for an unknown status, e.g. Cancelled', () => {
    const nodes = buildPipeline('direct', 'Cancelled');
    expect(nodes.some((n) => n.status === 'active' || n.status === 'done')).toBe(false);
  });

  it('always emits every stage', () => {
    expect(buildPipeline('hub', 'Delivered').map((n) => n.label)).toEqual([...PIPELINE_STAGES]);
  });
});

describe('password rules — the client is stricter than the server', () => {
  it('rejects a password the server would accept (6 chars)', () => {
    expect(isStrongPassword('abc123')).toBe(false);
  });

  it.each([
    ['no uppercase', 'abcd1234!'],
    ['no digit', 'Abcdefg!'],
    ['no special', 'Abcdefg1'],
    ['too short', 'Ab1!'],
  ])('rejects: %s', (_why, pw) => {
    expect(isStrongPassword(pw)).toBe(false);
  });

  it('accepts a password meeting all four rules', () => {
    expect(isStrongPassword('Seed@1234')).toBe(true);
  });

  it('reports every rule so the checklist can render it', () => {
    const results = passwordRuleResults('Ab1');
    expect(results).toHaveLength(PASSWORD_RULES.length);
    expect(results.map((r) => r.met)).toEqual([false, true, true, false]);
  });

  it('an empty password meets nothing', () => {
    expect(passwordRuleResults('').every((r) => !r.met)).toBe(true);
  });
});

describe('formatters', () => {
  it('joins an address, skipping blanks and nulls', () => {
    expect(buildAddress({ house_no: '12', street1: null, city: 'Pudukkottai' })).toBe(
      '12, Pudukkottai',
    );
  });

  it('resolves an address that is already a string', () => {
    expect(resolveAddress('12, Main St')).toBe('12, Main St');
    expect(resolveAddress(null)).toBe('');
  });

  it('gives cancelled orders their own colour and falls back for unknowns', () => {
    expect(statusColor('Cancelled')).toBe('#c0392b');
    expect(statusColor('Nonsense')).toBe('#757575'); // statusFallback = colors.gray (brand Text Grey)
  });

  it('formats money with grouping and paise, always', () => {
    expect(fmtMoney('88.20')).toBe('₹88.20');
    expect(fmtMoney(30)).toBe('₹30.00');
    expect(fmtMoney('nonsense')).toBe('—');
  });
});
