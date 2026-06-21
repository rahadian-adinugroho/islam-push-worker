import { PrayerTimes, CalculationMethod, Coordinates } from 'adhan';

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface PrayerTimeEntry {
  id: PrayerName;
  time: Date;
}

const ALL_PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/**
 * Map a calculation method name to its adhan equivalent.
 * Defaults to MuslimWorldLeague for unknown values.
 */
function getCalculationMethod(method: string): CalculationMethod {
  switch (method) {
    case 'singapore':
      return CalculationMethod.Singapore();
    case 'ummAlQura':
      return CalculationMethod.UmmAlQura();
    case 'muslimWorldLeague':
      return CalculationMethod.MuslimWorldLeague();
    case 'egyptian':
      return CalculationMethod.Egyptian();
    case 'karachi':
      return CalculationMethod.Karachi();
    case 'northAmerica':
      return CalculationMethod.NorthAmerica();
    case 'tehran':
      return CalculationMethod.Tehran();
    case 'turkey':
      return CalculationMethod.Turkey();
    default:
      return CalculationMethod.MuslimWorldLeague();
  }
}

/**
 * Calculate today's prayer times for a given location using the
 * specified calculation method (default: 'muslimWorldLeague').
 */
export function getTodayPrayerTimes(
  lat: number,
  lng: number,
  method: string = 'muslimWorldLeague',
): PrayerTimeEntry[] {
  const coords = new Coordinates(lat, lng);
  const params = getCalculationMethod(method);
  const date = new Date();
  const times = new PrayerTimes(coords, date, params) as Record<string, unknown>;

  return ALL_PRAYERS.map((id) => ({
    id,
    time: times[id] as Date,
  }));
}

/**
 * Extract the minutes-since-midnight from a prayer time Date.
 *
 * adhan stores local prayer time via the system-local Date constructor, so
 * getHours / getMinutes always return the intended local clock time
 * regardless of the runtime's timezone (UTC in Workers, local in dev).
 */
export function getPrayerTimeMinutes(prayerTime: Date): number {
  return prayerTime.getHours() * 60 + prayerTime.getMinutes();
}

/**
 * Return the current time in the given IANA timezone expressed as
 * minutes since midnight.
 */
export function getCurrentLocalMinutes(timezone: string): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [h, m] = formatter.format(now).split(':').map(Number);
  return h * 60 + m;
}

/**
 * Return today's date (YYYY-MM-DD) in the given IANA timezone.
 */
export function getTodayDateString(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}
