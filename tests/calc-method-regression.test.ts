import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Regression: ensure getTodayPrayerTimes calls the correct adhan calculation
// method. The original bug: even with calc_method="singapore" in D1, the
// Worker was computing Isha at MWL times (17°) instead of Singapore (18°).
// ---------------------------------------------------------------------------

const { mockSingapore, mockMwl } = vi.hoisted(() => ({
  mockSingapore: vi.fn(() => ({ method: 'singapore', ishaAngle: 18 })),
  mockMwl: vi.fn(() => ({ method: 'muslimWorldLeague', ishaAngle: 17 })),
}));

vi.mock('adhan', () => ({
  CalculationMethod: {
    Singapore: mockSingapore,
    MuslimWorldLeague: mockMwl,
    UmmAlQura: vi.fn(() => ({ method: 'ummAlQura' })),
    Egyptian: vi.fn(() => ({ method: 'egyptian' })),
    Karachi: vi.fn(() => ({ method: 'karachi' })),
    NorthAmerica: vi.fn(() => ({ method: 'northAmerica' })),
    Tehran: vi.fn(() => ({ method: 'tehran' })),
    Turkey: vi.fn(() => ({ method: 'turkey' })),
  },
  Coordinates: vi.fn(),
  PrayerTimes: class {
    fajr = new Date();
    dhuhr = new Date();
    asr = new Date();
    maghrib = new Date();
    isha = new Date();
  },
}));

import { getTodayPrayerTimes } from '../src/prayer-times';
import { normalizeCalcMethod } from '../src/i18n';

describe('calc method regression: singapore vs MWL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTodayPrayerTimes with "singapore" calls CalculationMethod.Singapore()', () => {
    getTodayPrayerTimes(-6.2, 106.8, 'singapore');
    expect(mockSingapore).toHaveBeenCalled();
    expect(mockMwl).not.toHaveBeenCalled();
  });

  it('getTodayPrayerTimes with "muslimWorldLeague" calls CalculationMethod.MuslimWorldLeague()', () => {
    getTodayPrayerTimes(-6.2, 106.8, 'muslimWorldLeague');
    expect(mockMwl).toHaveBeenCalled();
    expect(mockSingapore).not.toHaveBeenCalled();
  });

  it('getTodayPrayerTimes with null method (default) uses singapore', () => {
    // The default parameter in getTodayPrayerTimes is 'singapore'
    getTodayPrayerTimes(-6.2, 106.8);
    expect(mockSingapore).toHaveBeenCalled();
    expect(mockMwl).not.toHaveBeenCalled();
  });

  it('normalizeCalcMethod maps to the same string getTodayPrayerTimes receives', () => {
    // This validates the end-to-end contract: normalizeCalcMethod output
    // feeds directly into getTodayPrayerTimes input
    getTodayPrayerTimes(-6.2, 106.8, normalizeCalcMethod('singapore'));
    expect(mockSingapore).toHaveBeenCalled();
    expect(mockMwl).not.toHaveBeenCalled();

    vi.clearAllMocks();

    getTodayPrayerTimes(-6.2, 106.8, normalizeCalcMethod(null));
    // null should fall back to 'singapore'
    expect(mockSingapore).toHaveBeenCalled();
    expect(mockMwl).not.toHaveBeenCalled();
  });

  it('getTodayPrayerTimes with "singapore" and a timezone still uses Singapore()', () => {
    getTodayPrayerTimes(-6.2, 106.8, 'singapore', 'Asia/Jakarta');
    expect(mockSingapore).toHaveBeenCalled();
    expect(mockMwl).not.toHaveBeenCalled();
  });
});
