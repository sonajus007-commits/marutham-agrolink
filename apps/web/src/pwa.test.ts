import { describe, expect, it } from 'vitest';
import { isDevHost } from './pwa';

describe('isDevHost — where the offline worker must NOT be installed', () => {
  it('treats the developer machine and LAN as dev', () => {
    for (const h of [
      'localhost',
      '127.0.0.1',
      '[::1]',
      'app.localhost',
      'box.local',
      'marutham.test',
      '192.168.29.115',
      '10.0.0.5',
      '172.20.1.1',
    ]) {
      expect(isDevHost(h), h).toBe(true);
    }
  });
  it('treats public hosts as real deployments', () => {
    for (const h of ['marutham.in', 'app.marutham.in', '8.8.8.8', '172.32.0.1', '192.169.0.1']) {
      expect(isDevHost(h), h).toBe(false);
    }
  });
});
