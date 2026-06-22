import { find } from 'geo-tz';

/**
 * Derive the IANA timezone for a given lat/lng using the geo-tz
 * database. Most locations return a single timezone; disputed
 * boundaries may return multiple — we take the first.
 *
 * Falls back to 'UTC' if the lookup fails (e.g., mid-ocean).
 */
export function getTimezoneFromCoords(lat: number, lng: number): string {
  try {
    const results = find(lat, lng);
    if (results && results.length > 0) {
      return results[0];
    }
  } catch {
    // Fall through to UTC
  }
  return 'UTC';
}
