import { describe, it, expect } from 'vitest';
import { getTimezoneFromCoords } from '../src/timezone';

describe('getTimezoneFromCoords', () => {
  it('returns Asia/Jakarta for Jakarta coordinates', () => {
    const tz = getTimezoneFromCoords(-6.2, 106.8);
    expect(tz).toBe('Asia/Jakarta');
  });

  it('returns America/New_York for NYC coordinates', () => {
    const tz = getTimezoneFromCoords(40.7, -74.0);
    expect(tz).toBe('America/New_York');
  });

  it('returns Asia/Riyadh for Mecca coordinates', () => {
    const tz = getTimezoneFromCoords(21.4, 39.8);
    expect(tz).toBe('Asia/Riyadh');
  });

  it('returns Etc/GMT for mid-ocean coordinates (no timezone polygon)', () => {
    // Coordinates in the middle of the Atlantic Ocean
    // @photostructure/tz-lookup returns Etc/GMT for null island (0, 0)
    const tz = getTimezoneFromCoords(0, 0);
    expect(tz).toBe('Etc/GMT');
  });

  it('returns UTC for invalid coordinates', () => {
    const tz = getTimezoneFromCoords(NaN, NaN);
    expect(tz).toBe('UTC');
  });

  it('returns Europe/London for London coordinates', () => {
    const tz = getTimezoneFromCoords(51.5, -0.1);
    expect(tz).toBe('Europe/London');
  });

  it('returns Asia/Tokyo for Tokyo coordinates', () => {
    const tz = getTimezoneFromCoords(35.7, 139.7);
    expect(tz).toBe('Asia/Tokyo');
  });
});
