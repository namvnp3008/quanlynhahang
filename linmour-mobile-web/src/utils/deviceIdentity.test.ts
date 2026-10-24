import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDeviceAlias,
  setDeviceAlias,
  getDeviceId,
  setDeviceId,
  generateUUID,
} from './deviceIdentity';

describe('deviceIdentity (addedBy & deviceId)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('generates an RFC4122 v4 UUID and persists it across calls', () => {
    const id1 = getDeviceId();
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    const id2 = getDeviceId();
    expect(id2).toBe(id1);
  });

  it('allows overriding deviceId explicitly', () => {
    setDeviceId('custom-test-uuid');
    expect(getDeviceId()).toBe('custom-test-uuid');
  });

  it('generates a random guest alias (Khách 2-9) on first call and persists it', () => {
    const alias1 = getDeviceAlias();
    expect(alias1).toMatch(/^Khách [2-9]$/);

    // Subsequent calls return the same alias
    const alias2 = getDeviceAlias();
    expect(alias2).toBe(alias1);
  });

  it('avoids guest numbers already present in the existing table cart (PO follow-up C5.1)', () => {
    // If cart has "Khách 2", "Khách 3", "Khách 4", "Khách 5", "Khách 6", "Khách 7", "Khách 8"
    const existing = [
      { addedBy: 'Khách 2' },
      { addedBy: 'Khách 3' },
      { addedBy: 'Khách 4' },
      { addedBy: 'Khách 5' },
      { addedBy: 'Khách 6' },
      { addedBy: 'Khách 7' },
      { addedBy: 'Khách 8' },
    ];
    // Only "Khách 9" is available
    const alias = getDeviceAlias(existing);
    expect(alias).toBe('Khách 9');
  });

  it('allows overriding / setting alias explicitly', () => {
    setDeviceAlias('Khách 5');
    expect(getDeviceAlias()).toBe('Khách 5');
  });

  it('generateUUID creates distinct v4 UUIDs', () => {
    const u1 = generateUUID();
    const u2 = generateUUID();
    expect(u1).not.toBe(u2);
    expect(u1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
