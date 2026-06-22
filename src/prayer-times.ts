import { PrayerTimes, CalculationMethod, Coordinates } from 'adhan';

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface PrayerTimeEntry {
  id: PrayerName;
  time: Date;
}

const ALL_PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/**
 * Singapore method with Kemenag RI ihtiyat (precautionary) adjustments.
 * Matches the PWA behavior in website/islam/src/scripts/prayer-times.ts.
 */
function singaporeWithIhtiyat() {
  const params = CalculationMethod.Singapore();
  params.adjustments = {
    fajr: 2,
    sunrise: -2,
    dhuhr: 2,
    asr: 2,
    maghrib: 2,
    isha: 2,
  };
  return params;
}

/**
 * Map a calculation method name to its adhan equivalent.
 * Defaults to Singapore (with ihtiyat) for unknown or null values.
 */
function getCalculationMethod(method: string): CalculationMethod {
  switch (method) {
    case 'singapore':
      return singaporeWithIhtiyat();
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
      return singaporeWithIhtiyat();
  }
}

/**
 * Return a Date whose UTC components represent the user's local "today".
 * adhan extracts year/month/date from the Date, so this ensures prayer
 * times are computed for the user's local calendar day (not UTC day).
 *
 * Example: at 02:00 Jakarta time on Jan 2 (= 19:00 UTC Jan 1), this
 * returns a Date for Jan 2 — so adhan computes Jan 2's prayer times.
 */
export function getLocalToday(timezone: string): Date {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    return new Date(Date.UTC(+get('year'), +get('month') - 1, +get('day')));
  } catch {
    // Invalid timezone — fall back to UTC today
    return new Date();
  }
}

/**
 * Calculate today's prayer times for a given location.
 *
 * @param method - calculation method (default: 'singapore')
 * @param timezone - IANA timezone for "today" computation. If omitted,
 *                   uses UTC (which can be the wrong day for users
 *                   far from UTC during their early morning hours).
 */
export function getTodayPrayerTimes(
  lat: number,
  lng: number,
  method: string = 'singapore',
  timezone?: string,
): PrayerTimeEntry[] {
  const coords = new Coordinates(lat, lng);
  const params = getCalculationMethod(method);
  const date = timezone ? getLocalToday(timezone) : new Date();
  const times = new PrayerTimes(coords, date, params) as Record<string, unknown>;

  return ALL_PRAYERS.map((id) => ({
    id,
    time: times[id] as Date,
  }));
}

/**
 * Return today's date (YYYY-MM-DD) in the given IANA timezone.
 * Used for last_notified_date tracking (one notification per
 * prayer per local day).
 */
export function getTodayDateString(timezone: string): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    return new Date().toLocaleDateString('en-CA');
  }
}
