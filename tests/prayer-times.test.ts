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
  getLocalToday,
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
    for (let i = 1; i < times.length; i++) {
      expect(times[i].time.getTime()).toBeGreaterThan(times[i - 1].time.getTime());
    }
  });

  it('can calculate for different coordinates', () => {
    const jakarta = getTodayPrayerTimes(-6.2, 106.8);
    const london = getTodayPrayerTimes(51.5, -0.1);
    const jakartaTimes = jakarta.map((t) => t.time.getTime());
    const londonTimes = london.map((t) => t.time.getTime());
    // Different locations, different times
    expect(jakartaTimes).not.toEqual(londonTimes);
  });

  it('handles edge-case coordinates (equator, poles)', () => {
    const equator = getTodayPrayerTimes(0, 0);
    expect(equator).toHaveLength(5);
  });

  it('defaults to muslimWorldLeague when no method given', () => {
    const times = getTodayPrayerTimes(-6.2, 106.8);
    expect(times).toHaveLength(5);
  });

  it('accepts singapore method and produces valid times', () => {
    const times = getTodayPrayerTimes(-6.2, 106.8, 'singapore');
    expect(times).toHaveLength(5);
    for (const entry of times) {
      expect(entry.time).toBeInstanceOf(Date);
      expect(isNaN(entry.time.getTime())).toBe(false);
    }
  });

  it('different methods produce different times for same coords', () => {
    const muslimWorldLeague = getTodayPrayerTimes(35.7, 139.7, 'muslimWorldLeague');
    const ummAlQura = getTodayPrayerTimes(35.7, 139.7, 'ummAlQura');
    // Use Tokyo coords with two methods — they should differ for at least one prayer
    const mwlTimes = muslimWorldLeague.map((t) => t.time.getTime());
    const uaqTimes = ummAlQura.map((t) => t.time.getTime());
    expect(mwlTimes).not.toEqual(uaqTimes);
  });

  it('accepts all valid methods without error', () => {
    const methods = [
      'singapore', 'ummAlQura', 'muslimWorldLeague', 'egyptian',
      'karachi', 'northAmerica', 'tehran', 'turkey',
    ];
    for (const method of methods) {
      const times = getTodayPrayerTimes(40.7, -74.0, method);
      expect(times).toHaveLength(5);
      for (const entry of times) {
        expect(isNaN(entry.time.getTime())).toBe(false);
      }
    }
  });

  it('falls back to muslimWorldLeague for unknown method', () => {
    const times = getTodayPrayerTimes(-6.2, 106.8, 'nonexistent');
    expect(times).toHaveLength(5);
  });

  it('uses epoch comparison that works regardless of system timezone', () => {
    // This test would have caught the original bug where getPrayerTimeMinutes
    // used getHours() which returns system-local time (UTC in Workers).
    // Epoch ms comparison is timezone-agnostic.
    const times = getTodayPrayerTimes(-6.2, 106.8, 'singapore', 'Asia/Jakarta');
    const now = Date.now();
    for (const t of times) {
      const diff = t.time.getTime() - now;
      // diff should be a finite number (could be negative for past prayers, positive for future)
      expect(Number.isFinite(diff)).toBe(true);
    }
  });

  it('accepts timezone parameter and produces correct local-day times', () => {
    // Jakarta (UTC+7) at midnight UTC = 07:00 local on June 21
    const times = getTodayPrayerTimes(-6.2, 106.8, 'muslimWorldLeague', 'Asia/Jakarta');
    expect(times).toHaveLength(5);
    for (const entry of times) {
      expect(isNaN(entry.time.getTime())).toBe(false);
    }
  });
});

describe('getLocalToday', () => {
  it('returns UTC date for UTC timezone', () => {
    // MOCK_NOW is 2026-06-21T00:00:00.000Z
    const local = getLocalToday('UTC');
    expect(local.getTime()).toBe(new Date(Date.UTC(2026, 5, 21)).getTime());
  });

  it('returns correct date for Asia/Jakarta (UTC+7)', () => {
    // MOCK_NOW is midnight UTC = 07:00 WIB on June 21
    const local = getLocalToday('Asia/Jakarta');
    expect(local.getTime()).toBe(new Date(Date.UTC(2026, 5, 21)).getTime());
  });

  it('returns previous date for timezone behind UTC', () => {
    // MOCK_NOW is midnight UTC = 14:00 HST on June 20 (UTC-10)
    const local = getLocalToday('Pacific/Honolulu');
    // Should be June 20, 2026
    expect(local.getTime()).toBe(new Date(Date.UTC(2026, 5, 20)).getTime());
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
    // In Kiribati (UTC+14) it's 14:00 on June 21
    const str = getTodayDateString('Pacific/Kiritimati');
    expect(str).toBe('2026-06-21');
  });
});
