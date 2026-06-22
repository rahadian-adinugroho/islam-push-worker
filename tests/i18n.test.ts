import { describe, it, expect } from 'vitest';
import {
  normalizeLocale,
  normalizeCalcMethod,
  getPrayerName,
  getNotificationTitle,
} from '../src/i18n';

describe('normalizeLocale', () => {
  it('returns "en" for null', () => {
    expect(normalizeLocale(null)).toBe('en');
  });

  it('returns "en" for undefined', () => {
    expect(normalizeLocale(undefined)).toBe('en');
  });

  it('returns "en" for empty string', () => {
    expect(normalizeLocale('')).toBe('en');
  });

  it('returns "en" for "en"', () => {
    expect(normalizeLocale('en')).toBe('en');
  });

  it('returns "id" for "id"', () => {
    expect(normalizeLocale('id')).toBe('id');
  });

  it('returns "en" for "en-US"', () => {
    expect(normalizeLocale('en-US')).toBe('en');
  });

  it('returns "id" for "id-ID"', () => {
    expect(normalizeLocale('id-ID')).toBe('id');
  });

  it('returns "en" for unsupported locale "fr-FR"', () => {
    expect(normalizeLocale('fr-FR')).toBe('en');
  });

  it('returns "en" for unsupported locale "de"', () => {
    expect(normalizeLocale('de')).toBe('en');
  });

  it('is case-insensitive', () => {
    expect(normalizeLocale('ID')).toBe('id');
    expect(normalizeLocale('En')).toBe('en');
  });
});

describe('getPrayerName', () => {
  describe('English', () => {
    it('returns "Fajr" for fajr', () => {
      expect(getPrayerName('fajr', 'en')).toBe('Fajr');
    });
    it('returns "Dhuhr" for dhuhr', () => {
      expect(getPrayerName('dhuhr', 'en')).toBe('Dhuhr');
    });
    it('returns "Asr" for asr', () => {
      expect(getPrayerName('asr', 'en')).toBe('Asr');
    });
    it('returns "Maghrib" for maghrib', () => {
      expect(getPrayerName('maghrib', 'en')).toBe('Maghrib');
    });
    it('returns "Isha" for isha', () => {
      expect(getPrayerName('isha', 'en')).toBe('Isha');
    });
  });

  describe('Indonesian', () => {
    it('returns "Subuh" for fajr', () => {
      expect(getPrayerName('fajr', 'id')).toBe('Subuh');
    });
    it('returns "Dzuhur" for dhuhr', () => {
      expect(getPrayerName('dhuhr', 'id')).toBe('Dzuhur');
    });
    it('returns "Ashar" for asr', () => {
      expect(getPrayerName('asr', 'id')).toBe('Ashar');
    });
    it('returns "Maghrib" for maghrib', () => {
      expect(getPrayerName('maghrib', 'id')).toBe('Maghrib');
    });
    it('returns "Isya" for isha', () => {
      expect(getPrayerName('isha', 'id')).toBe('Isya');
    });
  });
});

describe('getNotificationTitle', () => {
  describe('English', () => {
    it('returns correct title and body for fajr', () => {
      const result = getNotificationTitle('fajr', 'en');
      expect(result.title).toBe('Prayer Time');
      expect(result.body).toBe("It's time for Fajr prayer");
    });

    it('returns correct body for each prayer', () => {
      const tests: Array<{ prayer: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'; expected: string }> = [
        { prayer: 'fajr', expected: "It's time for Fajr prayer" },
        { prayer: 'dhuhr', expected: "It's time for Dhuhr prayer" },
        { prayer: 'asr', expected: "It's time for Asr prayer" },
        { prayer: 'maghrib', expected: "It's time for Maghrib prayer" },
        { prayer: 'isha', expected: "It's time for Isha prayer" },
      ];
      for (const { prayer, expected } of tests) {
        const result = getNotificationTitle(prayer, 'en');
        expect(result.body).toBe(expected);
      }
    });
  });

  describe('Indonesian', () => {
    it('returns correct title and body for fajr', () => {
      const result = getNotificationTitle('fajr', 'id');
      expect(result.title).toBe('Waktu Sholat');
      expect(result.body).toBe('Waktu Subuh');
    });

    it('returns correct body for each prayer', () => {
      const tests: Array<{ prayer: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'; expected: string }> = [
        { prayer: 'fajr', expected: 'Waktu Subuh' },
        { prayer: 'dhuhr', expected: 'Waktu Dzuhur' },
        { prayer: 'asr', expected: 'Waktu Ashar' },
        { prayer: 'maghrib', expected: 'Waktu Maghrib' },
        { prayer: 'isha', expected: 'Waktu Isya' },
      ];
      for (const { prayer, expected } of tests) {
        const result = getNotificationTitle(prayer, 'id');
        expect(result.body).toBe(expected);
      }
    });
  });
});

describe('normalizeCalcMethod', () => {
  it('returns default for null', () => {
    expect(normalizeCalcMethod(null)).toBe('muslimWorldLeague');
  });

  it('returns default for undefined', () => {
    expect(normalizeCalcMethod(undefined)).toBe('muslimWorldLeague');
  });

  it('returns default for empty string', () => {
    expect(normalizeCalcMethod('')).toBe('muslimWorldLeague');
  });

  it('returns valid methods as-is', () => {
    const methods = [
      'singapore', 'ummAlQura', 'muslimWorldLeague', 'egyptian',
      'karachi', 'northAmerica', 'tehran', 'turkey',
    ];
    for (const method of methods) {
      expect(normalizeCalcMethod(method)).toBe(method);
    }
  });

  it('returns default for unknown method', () => {
    expect(normalizeCalcMethod('invalidMethod')).toBe('muslimWorldLeague');
  });
});
