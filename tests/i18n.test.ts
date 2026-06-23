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

describe('getNotificationTitle — title includes prayer name', () => {
  it('en/fajr title', () => {
    expect(getNotificationTitle('fajr', 'en').title).toBe('Fajr prayer time');
  });
  it('en/dhuhr title', () => {
    expect(getNotificationTitle('dhuhr', 'en').title).toBe('Dhuhr prayer time');
  });
  it('en/asr title', () => {
    expect(getNotificationTitle('asr', 'en').title).toBe('Asr prayer time');
  });
  it('en/maghrib title', () => {
    expect(getNotificationTitle('maghrib', 'en').title).toBe('Maghrib prayer time');
  });
  it('en/isha title', () => {
    expect(getNotificationTitle('isha', 'en').title).toBe('Isha prayer time');
  });
  it('id/fajr title', () => {
    expect(getNotificationTitle('fajr', 'id').title).toBe('Waktu Sholat Subuh');
  });
  it('id/dhuhr title', () => {
    expect(getNotificationTitle('dhuhr', 'id').title).toBe('Waktu Sholat Dzuhur');
  });
  it('id/asr title', () => {
    expect(getNotificationTitle('asr', 'id').title).toBe('Waktu Sholat Ashar');
  });
  it('id/maghrib title', () => {
    expect(getNotificationTitle('maghrib', 'id').title).toBe('Waktu Sholat Maghrib');
  });
  it('id/isha title', () => {
    expect(getNotificationTitle('isha', 'id').title).toBe('Waktu Sholat Isya');
  });
});

describe('getNotificationTitle — Fajr body (hadith)', () => {
  it('en/fajr returns hadith', () => {
    expect(getNotificationTitle('fajr', 'en').body).toBe('Prayer is better than sleep!');
  });
  it('id/fajr returns hadith', () => {
    expect(getNotificationTitle('fajr', 'id').body).toBe('Sholat itu lebih baik dari tidur!');
  });
});

describe('getNotificationTitle — non-Fajr body (motivational)', () => {
  it.each(['dhuhr', 'asr', 'maghrib', 'isha'] as const)('en/%s returns generic body', (prayer) => {
    expect(getNotificationTitle(prayer, 'en').body).toBe('The most beloved deed to Allah is the most consistent.');
  });
  it.each(['dhuhr', 'asr', 'maghrib', 'isha'] as const)('id/%s returns generic body', (prayer) => {
    expect(getNotificationTitle(prayer, 'id').body).toBe('Amalan yang paling dicintai Allah adalah yang paling konsisten.');
  });
});

describe('normalizeCalcMethod', () => {
  it('returns default for null', () => {
    expect(normalizeCalcMethod(null)).toBe('singapore');
  });

  it('returns default for undefined', () => {
    expect(normalizeCalcMethod(undefined)).toBe('singapore');
  });

  it('returns default for empty string', () => {
    expect(normalizeCalcMethod('')).toBe('singapore');
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
    expect(normalizeCalcMethod('invalidMethod')).toBe('singapore');
  });
});
