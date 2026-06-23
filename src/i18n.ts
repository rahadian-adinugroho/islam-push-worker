export type Locale = 'en' | 'id';
export type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export const PRAYER_NAMES: Record<Locale, Record<PrayerKey, string>> = {
  en: { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' },
  id: { fajr: 'Subuh', dhuhr: 'Dzuhur', asr: 'Ashar', maghrib: 'Maghrib', isha: 'Isya' },
};

export const APP_STRINGS: Record<Locale, {
  prayerTime: string;
  fajrBody: string;
  genericBody: string;
}> = {
  en: {
    prayerTime: '{name} prayer time',
    fajrBody: 'Prayer is better than sleep!',
    genericBody: 'The most beloved deed to Allah is the most consistent.',
  },
  id: {
    prayerTime: 'Waktu Sholat {name}',
    fajrBody: 'Sholat itu lebih baik dari tidur!',
    genericBody: 'Amalan yang paling dicintai Allah adalah yang paling konsisten.',
  },
};

/** Normalize a locale string to a supported locale, defaulting to 'en'. */
export function normalizeLocale(input: string | null | undefined): Locale {
  if (!input) return 'en';
  const lower = input.toLowerCase();
  if (lower.startsWith('id')) return 'id';
  return 'en';
}

/** Get the localized prayer name (e.g. "Subuh" for fajr in id). */
export function getPrayerName(prayer: PrayerKey, locale: Locale): string {
  return PRAYER_NAMES[locale][prayer];
}

const VALID_METHODS = new Set([
  'singapore', 'ummAlQura', 'muslimWorldLeague', 'egyptian',
  'karachi', 'northAmerica', 'tehran', 'turkey',
]);

/** Normalize a calculation method string, defaulting to 'singapore'. */
export function normalizeCalcMethod(input: string | null | undefined): string {
  if (!input) return 'singapore';
  if (VALID_METHODS.has(input)) return input;
  return 'singapore';
}

/** Get the localized notification title and body for a prayer. */
export function getNotificationTitle(
  prayer: PrayerKey,
  locale: Locale,
): { title: string; body: string } {
  const strings = APP_STRINGS[locale];
  const name = PRAYER_NAMES[locale][prayer];
  return {
    title: strings.prayerTime.replace('{name}', name),
    body: prayer === 'fajr' ? strings.fajrBody : strings.genericBody,
  };
}
