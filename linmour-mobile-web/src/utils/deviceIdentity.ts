const DEVICE_ALIAS_KEY = 'client_device_alias';
const DEVICE_ID_KEY = 'client_device_id';

/**
 * Generates an RFC4122 v4 compliant UUID
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns a persistent device ID (UUID).
 * Checks sessionStorage first (to allow multiple distinct guest tabs in same browser during testing),
 * then localStorage, generating a random UUID if not found.
 */
export function getDeviceId(): string {
  try {
    if (typeof window !== 'undefined') {
      const sessionVal = window.sessionStorage?.getItem(DEVICE_ID_KEY);
      if (sessionVal && sessionVal.trim().length > 0) {
        return sessionVal.trim();
      }
      const localVal = window.localStorage?.getItem(DEVICE_ID_KEY);
      if (localVal && localVal.trim().length > 0) {
        window.sessionStorage?.setItem(DEVICE_ID_KEY, localVal.trim());
        return localVal.trim();
      }
      const newId = generateUUID();
      window.sessionStorage?.setItem(DEVICE_ID_KEY, newId);
      window.localStorage?.setItem(DEVICE_ID_KEY, newId);
      return newId;
    }
  } catch (err) {
    console.warn('Cannot access storage for device ID:', err);
  }
  return 'device-fallback';
}

/**
 * For testing / override purposes
 */
export function setDeviceId(id: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.setItem(DEVICE_ID_KEY, id);
      window.localStorage?.setItem(DEVICE_ID_KEY, id);
    }
  } catch (err) {
    console.warn('Cannot save device ID:', err);
  }
}

/**
 * Returns a persistent device alias (e.g. "Khách 2").
 * Checks sessionStorage first, then localStorage.
 * If generating for the first time, selects an available number (2-9)
 * avoiding any guest numbers already present in the existing table cart.
 */
export function getDeviceAlias(existingItems?: Array<{ addedBy?: string }>): string {
  try {
    if (typeof window !== 'undefined') {
      const sessionVal = window.sessionStorage?.getItem(DEVICE_ALIAS_KEY);
      if (sessionVal && sessionVal.trim().length > 0) {
        return sessionVal.trim();
      }
      const localVal = window.localStorage?.getItem(DEVICE_ALIAS_KEY);
      if (localVal && localVal.trim().length > 0) {
        window.sessionStorage?.setItem(DEVICE_ALIAS_KEY, localVal.trim());
        return localVal.trim();
      }

      // Collect numbers already taken by peers in cart
      const takenNumbers = new Set<number>();
      if (existingItems && Array.isArray(existingItems)) {
        for (const item of existingItems) {
          if (item.addedBy) {
            const match = item.addedBy.match(/Khách\s*(\d+)/i);
            if (match) {
              takenNumbers.add(parseInt(match[1], 10));
            }
          }
        }
      }

      // Candidates from 2 to 9 not yet taken
      const available: number[] = [];
      for (let n = 2; n <= 9; n++) {
        if (!takenNumbers.has(n)) {
          available.push(n);
        }
      }

      const chosenNum =
        available.length > 0
          ? available[Math.floor(Math.random() * available.length)]
          : Math.floor(Math.random() * 8) + 2;

      const generated = `Khách ${chosenNum}`;
      window.sessionStorage?.setItem(DEVICE_ALIAS_KEY, generated);
      window.localStorage?.setItem(DEVICE_ALIAS_KEY, generated);
      return generated;
    }
  } catch (err) {
    console.warn('Cannot access storage for device alias:', err);
  }
  return 'Khách 2';
}

/**
 * For testing / override purposes
 */
export function setDeviceAlias(alias: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.setItem(DEVICE_ALIAS_KEY, alias);
      window.localStorage?.setItem(DEVICE_ALIAS_KEY, alias);
    }
  } catch (err) {
    console.warn('Cannot save device alias:', err);
  }
}
