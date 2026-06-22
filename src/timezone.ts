import tzlookup from '@photostructure/tz-lookup';

/**
 * Derive the IANA timezone for a given lat/lng using the
 * photostructure/tz-lookup database.
 *
 * Most locations return a single timezone. Falls back to 'UTC'
 * if the lookup fails (e.g., mid-ocean, invalid coords).
 */
export function getTimezoneFromCoords(lat: number, lng: number): string {
  try {
    const result = tzlookup(lat, lng);
    if (result) {
      return result;
    }
  } catch {
    // Fall through to UTC
  }
  return 'UTC';
}
