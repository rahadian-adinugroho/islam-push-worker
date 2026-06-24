import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';

// ---------------------------------------------------------------------------
// Mock web-push
// ---------------------------------------------------------------------------
const { mockSetVapidDetails, mockSendNotification } = vi.hoisted(() => ({
  mockSetVapidDetails: vi.fn(),
  mockSendNotification: vi.fn(),
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}));

// ---------------------------------------------------------------------------
// Mock timezone functions from the app
// ---------------------------------------------------------------------------
const { mockGetTimezoneFromCoords } = vi.hoisted(() => ({
  mockGetTimezoneFromCoords: vi.fn().mockReturnValue('Asia/Jakarta'),
}));

vi.mock('../src/timezone', () => ({
  getTimezoneFromCoords: mockGetTimezoneFromCoords,
}));

// Mock tz-lookup so the fallback works in tests
vi.mock('@photostructure/tz-lookup', () => ({
  default: vi.fn(() => 'Asia/Jakarta'),
}));

// ---------------------------------------------------------------------------
// Mock prayer-times to return controlled prayer times
// ---------------------------------------------------------------------------
vi.mock('../src/prayer-times', () => ({
  getTodayPrayerTimes: vi.fn().mockReturnValue([
    { id: 'fajr', time: new Date(Date.now() - 30_000) },
    { id: 'dhuhr', time: new Date(Date.now() + 5 * 3600_000) },
    { id: 'asr', time: new Date(Date.now() + 9 * 3600_000) },
    { id: 'maghrib', time: new Date(Date.now() + 12 * 3600_000) },
    { id: 'isha', time: new Date(Date.now() + 14 * 3600_000) },
  ]),
  getTodayDateString: vi.fn().mockReturnValue('2026-06-21'),
}));

import worker from '../src/index';

// ---------------------------------------------------------------------------
// In-memory D1 mock (reuse from integration.test.ts pattern)
// ---------------------------------------------------------------------------
function createMockD1(): D1Database {
  const rows: Record<string, Record<string, unknown>> = {};

  return {
    prepare: (query: string) => {
      const stmt = {
        bind: (...params: unknown[]) => {
          (stmt as unknown as { _params: unknown[] })._params = params;
          return stmt;
        },
        _params: [] as unknown[],
        all: async <T = Record<string, unknown>>() => ({
          results: Object.values(rows) as T[],
        }),
        first: async <T = Record<string, unknown>>() => {
          const endpointParam = (stmt as unknown as { _params: unknown[] })._params[0];
          const row = rows[String(endpointParam)];
          return (row as T) ?? null;
        },
        run: async () => {
          if (query.includes('INSERT OR REPLACE')) {
            const columns = query.match(/\(([^)]+)\)/)?.[1].split(',').map((c) => c.trim()) ?? [];
            const row: Record<string, unknown> = {};
            columns.forEach((col, i) => {
              row[col] = (stmt as unknown as { _params: unknown[] })._params[i];
            });
            rows[String(row.endpoint)] = row;
          } else if (query.includes('DELETE')) {
            const endpoint = String((stmt as unknown as { _params: unknown[] })._params[0]);
            delete rows[endpoint];
          } else if (query.includes('UPDATE')) {
            const params = (stmt as unknown as { _params: unknown[] })._params;
            const endpoint = String(params[params.length - 1]);
            const row = rows[endpoint];
            if (row) {
              const setMatch = query.match(/SET\s+([\s\S]+?)\s+WHERE/);
              if (setMatch) {
                const setCols = setMatch[1].split(',').map((c) => c.trim().split(' ')[0]);
                setCols.forEach((col, i) => {
                  row[col] = params[i];
                });
              }
            }
          }
          return { success: true };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

function makeEnv(): { DB: D1Database; VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT: string; PN_BUFFER_SECONDS: string; PN_BATCH_SIZE: string } {
  return {
    DB: createMockD1(),
    VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: 'test-private-key',
    VAPID_SUBJECT: 'mailto:test@example.com',
    PN_BUFFER_SECONDS: '30',
    PN_BATCH_SIZE: '50',
  };
}

// Add a subscription to the mock D1 with the given overrides
async function addSub(
  env: ReturnType<typeof makeEnv>,
  overrides: Partial<{
    endpoint: string;
    lat: number;
    lng: number;
    timezone: string | null;
    locale: string;
    calc_method: string;
    notify_fajr: number;
    notify_dhuhr: number;
    notify_asr: number;
    notify_maghrib: number;
    notify_isha: number;
    last_notified_date: string | null;
    last_notified_prayer: string | null;
  }> = {},
) {
  const defaults = {
    endpoint: 'https://example.com/push/1',
    keys_p256dh: 'p256dh',
    keys_auth: 'auth',
    lat: -6.2,
    lng: 106.8,
    timezone: 'Asia/Jakarta',
    locale: 'en',
    calc_method: 'singapore',
    notify_fajr: 1,
    notify_dhuhr: 1,
    notify_asr: 1,
    notify_maghrib: 1,
    notify_isha: 1,
    last_notified_date: null,
    last_notified_prayer: null,
  };

  const row = { ...defaults, ...overrides };
  // Use the raw D1 mock to insert the row
  const db = env.DB as unknown as { prepare: (q: string) => { bind: (...p: unknown[]) => { run: () => Promise<{ success: boolean }> } } };
  const keys = Object.keys(row);
  const placeholders = keys.map(() => '?').join(',');
  const stmt = db.prepare(`INSERT OR REPLACE INTO subscriptions (${keys.join(',')}) VALUES (${placeholders})`);
  await stmt.bind(...Object.values(row)).run();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('scheduled handler — parallelism and batching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendNotification.mockResolvedValue({ statusCode: 201 });
  });

  it('sends PNs in parallel for multiple users', async () => {
    const env = makeEnv();
    for (let i = 1; i <= 5; i++) {
      await addSub(env, {
        endpoint: `https://example.com/push/${i}`,
        notify_fajr: 1,
        notify_dhuhr: 0,
        notify_asr: 0,
        notify_maghrib: 0,
        notify_isha: 0,
      });
    }

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    // All 5 should be sent (no sequential blocking means they all go through)
    expect(mockSendNotification).toHaveBeenCalledTimes(5);
  });

  it('batches to 50 and defers the rest', async () => {
    const env = makeEnv();
    for (let i = 1; i <= 60; i++) {
      await addSub(env, {
        endpoint: `https://example.com/push/${i}`,
        notify_fajr: 1,
        notify_dhuhr: 0,
        notify_asr: 0,
        notify_maghrib: 0,
        notify_isha: 0,
      });
    }

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    // Only 50 should be sent in this cron run (BATCH_SIZE=50)
    expect(mockSendNotification).toHaveBeenCalledTimes(50);
  });

  it('isolates errors so one failure does not block others', async () => {
    const env = makeEnv();
    // Subscriptions with endpoints 1-5
    for (let i = 1; i <= 5; i++) {
      await addSub(env, {
        endpoint: `https://example.com/push/${i}`,
        notify_fajr: 1,
        notify_dhuhr: 0,
        notify_asr: 0,
        notify_maghrib: 0,
        notify_isha: 0,
      });
    }

    // Make the third subscription throw a network error
    mockSendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === 'https://example.com/push/3') {
        throw new Error('Network error');
      }
      return { statusCode: 201 };
    });

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    // All 5 were attempted
    expect(mockSendNotification).toHaveBeenCalledTimes(5);

    // The 4 successful ones should have been marked notified.
    // Read from D1 to verify.
    const result = await env.DB.prepare('SELECT endpoint, last_notified_date, last_notified_prayer FROM subscriptions').all<{
      endpoint: string;
      last_notified_date: string | null;
      last_notified_prayer: string | null;
    }>();
    const notified = result.results.filter((r) => r.last_notified_date === '2026-06-21');
    expect(notified).toHaveLength(4);
    // The failed one (push/3) should not be marked notified
    const failed = result.results.find((r) => r.endpoint === 'https://example.com/push/3');
    expect(failed?.last_notified_date).toBeNull();
  });

  it('handles dead subscription (410) and removes it while notifying others', async () => {
    const env = makeEnv();
    for (let i = 1; i <= 5; i++) {
      await addSub(env, {
        endpoint: `https://example.com/push/${i}`,
        notify_fajr: 1,
        notify_dhuhr: 0,
        notify_asr: 0,
        notify_maghrib: 0,
        notify_isha: 0,
      });
    }

    // Make the second subscription dead (410)
    mockSendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === 'https://example.com/push/2') {
        const err = new Error('Gone') as Error & { statusCode: number };
        err.statusCode = 410;
        throw err;
      }
      return { statusCode: 201 };
    });

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    // All 5 were attempted
    expect(mockSendNotification).toHaveBeenCalledTimes(5);

    // The dead one should be removed
    const result = await env.DB.prepare('SELECT endpoint FROM subscriptions').all<{ endpoint: string }>();
    const endpoints = result.results.map((r) => r.endpoint);
    expect(endpoints).not.toContain('https://example.com/push/2');
    expect(endpoints).toHaveLength(4);
  });

  it('skips already-notified subscriptions', async () => {
    const env = makeEnv();
    await addSub(env, {
      endpoint: 'https://example.com/push/1',
      notify_fajr: 1,
      notify_dhuhr: 0,
      notify_asr: 0,
      notify_maghrib: 0,
      notify_isha: 0,
      last_notified_date: '2026-06-21',
      last_notified_prayer: 'fajr',
    });

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    // Already notified — no PN sent
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('handles empty subscriptions gracefully', async () => {
    const env = makeEnv();
    // No subscriptions added

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('skips all subscriptions when all notify flags are off', async () => {
    const env = makeEnv();
    await addSub(env, {
      endpoint: 'https://example.com/push/1',
      notify_fajr: 0,
      notify_dhuhr: 0,
      notify_asr: 0,
      notify_maghrib: 0,
      notify_isha: 0,
    });

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});

describe('scheduled handler — CPU cap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendNotification.mockResolvedValue({ statusCode: 201 });
  });

  it('stops iterating when tasks.length reaches batchSize', async () => {
    const env = makeEnv();
    // Add 60 subs with fajr enabled and within PN window
    for (let i = 0; i < 60; i++) {
      await addSub(env, {
        endpoint: `https://push.example.com/sub-${i}`,
        notify_fajr: 1,
        notify_dhuhr: 0,
        notify_asr: 0,
        notify_maghrib: 0,
        notify_isha: 0,
      });
    }

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    // Exactly batchSize sends (50), the rest deferred
    expect(mockSendNotification).toHaveBeenCalledTimes(50);
  });

  it('processes all subs when under batchSize', async () => {
    const env = makeEnv();
    for (let i = 0; i < 5; i++) {
      await addSub(env, {
        endpoint: `https://push.example.com/sub-${i}`,
        notify_fajr: 1,
        notify_dhuhr: 0,
        notify_asr: 0,
        notify_maghrib: 0,
        notify_isha: 0,
      });
    }

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    // All 5 sent (under batchSize limit)
    expect(mockSendNotification).toHaveBeenCalledTimes(5);
  });
});

describe('scheduled handler — D1 timezone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendNotification.mockResolvedValue({ statusCode: 201 });
    mockGetTimezoneFromCoords.mockClear();
  });

  it('uses D1 timezone when present', async () => {
    const env = makeEnv();
    await addSub(env, {
      endpoint: 'https://push.example.com/sub-1',
      timezone: 'Asia/Jakarta',
      notify_fajr: 1,
      notify_dhuhr: 0,
      notify_asr: 0,
      notify_maghrib: 0,
      notify_isha: 0,
    });

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    // getTimezoneFromCoords NOT called (D1 timezone used directly)
    expect(mockGetTimezoneFromCoords).not.toHaveBeenCalled();
    // Push was sent
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
  });

  it('falls back to coords when D1 timezone is null', async () => {
    const env = makeEnv();
    // Insert a subscription with NULL timezone
    await addSub(env, {
      endpoint: 'https://push.example.com/sub-1',
      timezone: null,
      notify_fajr: 1,
      notify_dhuhr: 0,
      notify_asr: 0,
      notify_maghrib: 0,
      notify_isha: 0,
    });

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    // getTimezoneFromCoords called once with the coords
    expect(mockGetTimezoneFromCoords).toHaveBeenCalledTimes(1);
    expect(mockGetTimezoneFromCoords).toHaveBeenCalledWith(-6.2, 106.8);
    // Push was sent
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
  });
});
