import { describe, it, expect } from 'vitest';
import { getTodayPrayerTimes } from '../src/prayer-times';
import { normalizeCalcMethod } from '../src/i18n';
import { PrayerTimes, CalculationMethod, Coordinates } from 'adhan';

// ---------------------------------------------------------------------------
// Reproduction test for 2-minute Isha discrepancy between Worker and PWA.
//
// User reports:
//   PWA shows Isha at 19:06 Jakarta (12:06 UTC)
//   Worker computed Isha at 19:04 Jakarta (12:04 UTC)
//   Coordinates: (-6.3015809959844615, 106.65029044835221)
//   Date: 2026-06-22
//   D1 row has calc_method: "singapore"
//
// ROOT CAUSE: The PWA applies Kemenag RI ihtiyat (precautionary)
// adjustments of +2 minutes for all prayers when using the Singapore
// method (see website/islam/src/scripts/prayer-times.ts:52-60).
// The Worker was not applying these adjustments.
//
// Fix: Added ihtiyat adjustments to the Singapore method in
// getCalculationMethod() (src/prayer-times.ts).
//
// Raw adhan Singapore (no adjustments): Isha at 12:04 UTC (19:04 Jakarta)
// PWA / fixed Worker:                   Isha at 12:06 UTC (19:06 Jakarta)
// ---------------------------------------------------------------------------

const LAT = -6.3015809959844615;
const LNG = 106.65029044835221;
const DATE_UTC = new Date('2026-06-22T00:00:00.000Z');
 const JAKARTA_FMT = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false } as const;

describe('Isha reproduction — actual coords (2026-06-22, Jakarta)', () => {
  it('RAW adhan Singapore (no ihtiyat) computes Isha at 12:04 UTC (19:04 Jakarta)', () => {
    const coords = new Coordinates(LAT, LNG);
    const params = CalculationMethod.Singapore();
    const pt = new PrayerTimes(coords, DATE_UTC, params);

    const ishaUtc = pt.isha.toISOString();
    const ishaJakarta = new Intl.DateTimeFormat('en-GB', JAKARTA_FMT).format(pt.isha);

    // Raw adhan without adjustments — matches the unpatched Worker
    expect(ishaUtc).toMatch(/T12:04:00/);
    expect(ishaJakarta).toBe('19:04');
  });

  it('MWL method computes Isha at 11:59 UTC (18:59 Jakarta) — 5 min earlier', () => {
    const coords = new Coordinates(LAT, LNG);
    const params = CalculationMethod.MuslimWorldLeague();
    const pt = new PrayerTimes(coords, DATE_UTC, params);

    const ishaUtc = pt.isha.toISOString();
    const ishaJakarta = new Intl.DateTimeFormat('en-GB', JAKARTA_FMT).format(pt.isha);

    expect(ishaUtc).toMatch(/T11:59:00/);
    expect(ishaJakarta).toBe('18:59');
  });

  it('RAW Singapore and MWL differ by 5 min (300000ms), not 2 min', () => {
    const coords = new Coordinates(LAT, LNG);
    const singaporePt = new PrayerTimes(coords, DATE_UTC, CalculationMethod.Singapore());
    const mwlPt = new PrayerTimes(coords, DATE_UTC, CalculationMethod.MuslimWorldLeague());

    const diffMs = singaporePt.isha.getTime() - mwlPt.isha.getTime();
    expect(diffMs).toBe(300_000); // 5 minutes
  });

  it('FIXED Worker (with ihtiyat) produces Isha at 19:06 Jakarta (12:06 UTC)', () => {
    // This tests the Worker's code path AFTER the ihtiyat fix.
    const times = getTodayPrayerTimes(LAT, LNG, 'singapore', 'Asia/Jakarta');
    const isha = times.find(t => t.id === 'isha')!;
    const ishaJakarta = new Intl.DateTimeFormat('en-GB', JAKARTA_FMT).format(isha.time);

    // Now matches the PWA with +2 minute ihtiyat adjustments
    expect(ishaJakarta).toBe('19:06');
  });

  it('getTodayPrayerTimes with MWL produces 18:59 Jakarta', () => {
    const times = getTodayPrayerTimes(LAT, LNG, 'muslimWorldLeague', 'Asia/Jakarta');
    const isha = times.find(t => t.id === 'isha')!;
    const ishaJakarta = new Intl.DateTimeFormat('en-GB', JAKARTA_FMT).format(isha.time);

    expect(ishaJakarta).toBe('18:59');
  });

  it('Singapore + ihtiyat adjustments produce +2 min for each prayer', () => {
    const coords = new Coordinates(LAT, LNG);
    const raw = CalculationMethod.Singapore();
    const adjusted = CalculationMethod.Singapore();
    adjusted.adjustments = { fajr: 2, sunrise: -2, dhuhr: 2, asr: 2, maghrib: 2, isha: 2 };

    const rawPt = new PrayerTimes(coords, DATE_UTC, raw);
    const adjPt = new PrayerTimes(coords, DATE_UTC, adjusted);

    expect(adjPt.fajr.getTime() - rawPt.fajr.getTime()).toBe(120_000);
    expect(adjPt.dhuhr.getTime() - rawPt.dhuhr.getTime()).toBe(120_000);
    expect(adjPt.isha.getTime() - rawPt.isha.getTime()).toBe(120_000);
  });
});

describe('Isha method dispatch — adhan mock', () => {
  // Verify the dispatch is correct
  it('normalizeCalcMethod preserves "singapore"', () => {
    expect(normalizeCalcMethod('singapore')).toBe('singapore');
    expect(normalizeCalcMethod(null)).toBe('singapore');
    expect(normalizeCalcMethod('muslimWorldLeague')).toBe('muslimWorldLeague');
  });
});
