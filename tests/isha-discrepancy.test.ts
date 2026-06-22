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
//   Suspected cause: Worker using MWL (17°) instead of Singapore (18°)
//
// Findings from direct adhan computation:
//   Singapore (18°) → Isha at 12:04 UTC (19:04 Jakarta)
//   MWL (17°)      → Isha at 11:59 UTC (18:59 Jakarta)
//   Difference: 5 minutes, NOT 2 minutes as user expected
//
// Conclusion: The Worker correctly uses Singapore method and computes
// Isha at 19:04 Jakarta. The PWA's 19:06 cannot be reproduced with
// adhan's Singapore method for these coordinates on this date.
// The 2-minute discrepancy is NOT between Singapore and MWL, but
// between the Worker (adhan) and the PWA (possibly different lib).
// ---------------------------------------------------------------------------

const LAT = -6.3015809959844615;
const LNG = 106.65029044835221;
const DATE_UTC = new Date('2026-06-22T00:00:00.000Z');
 const JAKARTA_FMT = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false } as const;

describe('Isha reproduction — actual coords (2026-06-22, Jakarta)', () => {
  it('Singapore method computes Isha at 12:04 UTC (19:04 Jakarta)', () => {
    const coords = new Coordinates(LAT, LNG);
    const params = CalculationMethod.Singapore();
    const pt = new PrayerTimes(coords, DATE_UTC, params);

    const ishaUtc = pt.isha.toISOString();
    const ishaJakarta = new Intl.DateTimeFormat('en-GB', JAKARTA_FMT).format(pt.isha);

    // Expected from adhan library
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

  it('Singapore and MWL differ by 5 min (300000ms), not 2 min', () => {
    const coords = new Coordinates(LAT, LNG);
    const singaporePt = new PrayerTimes(coords, DATE_UTC, CalculationMethod.Singapore());
    const mwlPt = new PrayerTimes(coords, DATE_UTC, CalculationMethod.MuslimWorldLeague());

    const diffMs = singaporePt.isha.getTime() - mwlPt.isha.getTime();
    expect(diffMs).toBe(300_000); // 5 minutes
  });

  it('PWA expected value 19:06 cannot be reproduced with Singapore method', () => {
    // Check if any nearby dates give 19:06
    let found = false;
    for (let dayOffset = -2; dayOffset <= 2; dayOffset++) {
      const d = new Date(DATE_UTC);
      d.setUTCDate(d.getUTCDate() + dayOffset);
      const coords = new Coordinates(LAT, LNG);
      const pt = new PrayerTimes(coords, d, CalculationMethod.Singapore());
      const jakarta = new Intl.DateTimeFormat('en-GB', JAKARTA_FMT).format(pt.isha);
      if (jakarta === '19:06') {
        found = true;
        break;
      }
    }
    // None of the adjacent dates give 19:06 with Singapore method
    expect(found).toBe(false);
  });

  it('getTodayPrayerTimes with singapore method produces same result', () => {
    // This tests the actual code path used in the scheduled handler
    const times = getTodayPrayerTimes(LAT, LNG, 'singapore', 'Asia/Jakarta');
    const isha = times.find(t => t.id === 'isha')!;
    const ishaJakarta = new Intl.DateTimeFormat('en-GB', JAKARTA_FMT).format(isha.time);

    expect(ishaJakarta).toBe('19:04');
  });

  it('getTodayPrayerTimes with MWL produces 18:59 Jakarta', () => {
    const times = getTodayPrayerTimes(LAT, LNG, 'muslimWorldLeague', 'Asia/Jakarta');
    const isha = times.find(t => t.id === 'isha')!;
    const ishaJakarta = new Intl.DateTimeFormat('en-GB', JAKARTA_FMT).format(isha.time);

    expect(ishaJakarta).toBe('18:59');
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
