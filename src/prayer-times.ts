import { PrayerTimes, CalculationMethod, Coordinates } from 'adhan';

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface PrayerTimeEntry {
  id: PrayerName;
  time: Date;
}

const ALL_PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/**
 * Calculate today's prayer times for a given location using the
 * Singapore / Kemenag (Indonesian Ministry of Religious Affairs) method.
 */
export function getTodayPrayerTimes(lat: number, lng: number): PrayerTimeEntry[] {
  const coords = new Coordinates(lat, lng);
  const params = CalculationMethod.Singapore();
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
