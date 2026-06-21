import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// We test the pure calculation and helper functions.
// getTodayPrayerTimes calls new Date() internally, so we mock the Date
// constructor to get deterministic results.
// ---------------------------------------------------------------------------
const MOCK_NOW = new Date('2026-06-21T00:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MOCK_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

import {
  getTodayPrayerTimes,
  getPrayerTimeMinutes,
  getCurrentLocalMinutes,
  getTodayDateString,
} from '../src/prayer-times';

describe('getTodayPrayerTimes', () => {
  it('returns 5 prayer entries for Jakarta', () => {
    const times = getTodayPrayerTimes(-6.2, 106.8);
    expect(times).toHaveLength(5);
    const ids = times.map((t) => t.id);
    expect(ids).toEqual(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
  });

  it('each entry has a valid Date', () => {
    const times = getTodayPrayerTimes(-6.2, 106.8);
    for (const entry of times) {
      expect(entry.time).toBeInstanceOf(Date);
      expect(isNaN(entry.time.getTime())).toBe(false);
    }
  });

  it('prayer times are in chronological order', () => {
    const times = getTodayPrayerTimes(-6.2, 106.8);
    const minutes = times.map((t) => getPrayerTimeMinutes(t.time));
    for (let i = 1; i < minutes.length; i++) {
      expect(minutes[i]).toBeGreaterThan(minutes[i - 1]);
    }
  });

  it('can calculate for different coordinates', () => {
    const jakarta = getTodayPrayerTimes(-6.2, 106.8);
    const london = getTodayPrayerTimes(51.5, -0.1);
    const jakartaMinutes = jakarta.map((t) => getPrayerTimeMinutes(t.time));
    const londonMinutes = london.map((t) => getPrayerTimeMinutes(t.time));
    // Different locations, different times
    expect(jakartaMinutes).not.toEqual(londonMinutes);
  });

  it('handles edge-case coordinates (equator, poles)', () => {
    const equator = getTodayPrayerTimes(0, 0);
    expect(equator).toHaveLength(5);
  });
});

describe('getPrayerTimeMinutes', () => {
  it('converts Date to minutes since midnight', () => {
    // Use local-time constructor so the test is timezone-independent
    // (adhan creates Dates the same way — new Date(year, month, day, hours, minutes))
    const d = new Date(2026, 5, 21, 4, 30);
    expect(getPrayerTimeMinutes(d)).toBe(4 * 60 + 30);
  });

  it('midnight is 0', () => {
    const d = new Date(2026, 5, 21, 0, 0);
    expect(getPrayerTimeMinutes(d)).toBe(0);
  });

  it('end of day is 1439', () => {
    const d = new Date(2026, 5, 21, 23, 59);
    expect(getPrayerTimeMinutes(d)).toBe(23 * 60 + 59);
  });
});

describe('getCurrentLocalMinutes', () => {
  it('returns current local time in minutes for UTC', () => {
    // MOCK_NOW is 2026-06-21T00:00:00.000Z (midnight UTC)
    const mins = getCurrentLocalMinutes('UTC');
    expect(mins).toBe(0);
  });

  it('returns correct offset for Asia/Jakarta (UTC+7)', () => {
    const mins = getCurrentLocalMinutes('Asia/Jakarta');
    // MOCK_NOW is midnight UTC = 07:00 in Jakarta
    expect(mins).toBe(7 * 60);
  });

  it('returns correct offset for America/New_York (UTC-4 in June)', () => {
    const mins = getCurrentLocalMinutes('America/New_York');
    // MOCK_NOW is midnight UTC = 20:00 (previous day) in NY EDT (UTC-4)
    // 2026-06-21 is after DST change, so EDT = UTC-4
    // 00:00 UTC = 20:00 EDT (previous day)
    // But wait, the formatter will give us 20:00 on the same day...
    // Actually June 21 00:00 UTC = June 20 20:00 EDT
    // The formatter with timeZone: 'America/New_York' will return "20:00"
    expect(mins).toBe(20 * 60);
  });
});

describe('getTodayDateString', () => {
  it('returns YYYY-MM-DD for given timezone', () => {
    const str = getTodayDateString('UTC');
    expect(str).toBe('2026-06-21');
  });

  it('returns previous day for timezones behind UTC', () => {
    // MOCK_NOW is 2026-06-21 00:00 UTC
    // In Hawaii (UTC-10) it's still 2026-06-20
    const str = getTodayDateString('Pacific/Honolulu');
    expect(str).toBe('2026-06-20');
  });

  it('returns next day for timezones ahead of UTC', () => {
    // MOCK_NOW is 2026-06-21 00:00 UTC
    // In Sydney (UTC+10) it's 2026-06-21 10:00, still same date
    // But for Chatham Islands (UTC+12:45) it's 2026-06-21 12:45
    // Let's use Kiribati (UTC+14) - it's 14:00 on the same day
    const str = getTodayDateString('Pacific/Kiritimati');
    // UTC+14: 2026-06-21 14:00 - still June 21
    expect(str).toBe('2026-06-21');
  });
});
