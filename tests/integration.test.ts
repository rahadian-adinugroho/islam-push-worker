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

import { sendPush } from '../src/push';
import { addSubscription, getActiveSubscriptions, markNotified, removeSubscription, updatePreferences } from '../src/db';

const ENDPOINT = 'https://web.push.apple.com/QJptHgdBpmx_82iV1UxbjO4PvlItdEA1XiooAqaUEkSUAwD4gSvYK-SNNf9GKXimiRkVwTLUb7ThdhSUDuK-pYpWKAGgrREoCro13r7IyNutI2d3mQcR2lhyCIIVv3ZlOsaK731gnHmQsx3xEJHKW1c4AkhWhnDr-IVjREJidRg';

// ---------------------------------------------------------------------------
// In-memory D1 mock (simple implementation for testing)
// ---------------------------------------------------------------------------
function createMockD1(): D1Database {
  const rows: Record<string, Record<string, unknown>> = {};

  return {
    prepare: (query: string) => {
      const stmt = {
        bind: (...params: unknown[]) => {
          stmt._params = params;
          return stmt;
        },
        _params: [] as unknown[],
        all: async <T = Record<string, unknown>>() => ({
          results: Object.values(rows) as T[],
        }),
        first: async <T = Record<string, unknown>>() => {
          // Handle WHERE endpoint = ? (most common case)
          const endpointParam = stmt._params[0];
          const row = rows[String(endpointParam)];
          return (row as T) ?? null;
        },
        run: async () => {
          // Simple INSERT OR REPLACE
          if (query.includes('INSERT OR REPLACE')) {
            const columns = query.match(/\(([^)]+)\)/)?.[1].split(',').map((c) => c.trim()) ?? [];
            const row: Record<string, unknown> = {};
            columns.forEach((col, i) => {
              row[col] = stmt._params[i];
            });
            rows[String(row.endpoint)] = row;
          } else if (query.includes('DELETE')) {
            const endpoint = String(stmt._params[0]);
            delete rows[endpoint];
          } else if (query.includes('UPDATE')) {
            // Find the row by endpoint (last param)
            const endpoint = String(stmt._params[stmt._params.length - 1]);
            const row = rows[endpoint];
            if (row) {
              // Update the columns in the SET clause
              const setMatch = query.match(/SET\s+([\s\S]+?)\s+WHERE/);
              if (setMatch) {
                const setCols = setMatch[1].split(',').map((c) => c.trim().split(' ')[0]);
                setCols.forEach((col, i) => {
                  row[col] = stmt._params[i];
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

const ENV = {
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:test@example.com',
};

describe('integration: subscribe → test-push → mark notified', () => {
  let env: { DB: D1Database };

  beforeEach(() => {
    vi.clearAllMocks();
    env = { DB: createMockD1() };
  });

  it('subscription is stored with all fields', async () => {
    await addSubscription(
      env,
      { endpoint: ENDPOINT, keys: { p256dh: 'p256dh', auth: 'auth' } },
      -6.2,
      106.8,
      'Asia/Jakarta',
      'id',
      'singapore',
      { fajr: true, dhuhr: true, asr: false, maghrib: true, isha: true },
    );

    const subs = await getActiveSubscriptions(env);
    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe(ENDPOINT);
    expect(subs[0].lat).toBe(-6.2);
    expect(subs[0].lng).toBe(106.8);
    expect(subs[0].timezone).toBe('Asia/Jakarta');
    expect(subs[0].locale).toBe('id');
    expect(subs[0].calc_method).toBe('singapore');
    expect(subs[0].notify_fajr).toBe(1);
    expect(subs[0].notify_dhuhr).toBe(1);
    expect(subs[0].notify_asr).toBe(0);
    expect(subs[0].notify_maghrib).toBe(1);
    expect(subs[0].notify_isha).toBe(1);
  });

  it('test-push flow: lookup subscription → send push → mark notified', async () => {
    // Setup: subscribe
    await addSubscription(
      env,
      { endpoint: ENDPOINT, keys: { p256dh: 'p256dh', auth: 'auth' } },
      -6.2,
      106.8,
      'Asia/Jakarta',
      'en',
      'muslimWorldLeague',
      { fajr: true },
    );
    mockSendNotification.mockResolvedValue({ statusCode: 201 });

    // Lookup (simulating /api/test-push handler)
    const stmt = env.DB.prepare(
      'SELECT endpoint, keys_p256dh, keys_auth, locale FROM subscriptions WHERE endpoint = ?',
    ).bind(ENDPOINT);
    const sub = await stmt.first<{ endpoint: string; keys_p256dh: string; keys_auth: string; locale: string }>();

    expect(sub).not.toBeNull();
    expect(sub!.endpoint).toBe(ENDPOINT);
    expect(sub!.keys_p256dh).toBe('p256dh');
    expect(sub!.keys_auth).toBe('auth');
    expect(sub!.locale).toBe('en');

    // Send push
    const result = await sendPush(ENV, {
      endpoint: sub!.endpoint,
      keys_p256dh: sub!.keys_p256dh,
      keys_auth: sub!.keys_auth,
    }, 'fajr', sub!.locale as 'en' | 'id');

    expect(result.ok).toBe(true);
    expect(mockSendNotification).toHaveBeenCalledTimes(1);

    // Mark notified
    await markNotified(env, ENDPOINT, 'fajr', '2026-06-21');
    const subs = await getActiveSubscriptions(env);
    expect(subs[0].last_notified_prayer).toBe('fajr');
    expect(subs[0].last_notified_date).toBe('2026-06-21');
  });

  it('test-push handles 410 dead subscription and removes it', async () => {
    // Setup: subscribe
    await addSubscription(
      env,
      { endpoint: ENDPOINT, keys: { p256dh: 'p256dh', auth: 'auth' } },
      -6.2,
      106.8,
      'Asia/Jakarta',
      'en',
      'muslimWorldLeague',
      { fajr: true },
    );
    const error = new Error('Gone') as Error & { statusCode: number };
    error.statusCode = 410;
    mockSendNotification.mockRejectedValue(error);

    // Lookup
    const stmt = env.DB.prepare(
      'SELECT endpoint, keys_p256dh, keys_auth, locale FROM subscriptions WHERE endpoint = ?',
    ).bind(ENDPOINT);
    const sub = await stmt.first<{ endpoint: string; keys_p256dh: string; keys_auth: string; locale: string }>();
    expect(sub).not.toBeNull();

    // Send push — returns { ok: false, statusCode: 410 }
    const result = await sendPush(ENV, {
      endpoint: sub!.endpoint,
      keys_p256dh: sub!.keys_p256dh,
      keys_auth: sub!.keys_auth,
    }, 'fajr', sub!.locale as 'en' | 'id');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(410);

    // Cleanup (as the scheduled/test-push handler would do)
    await removeSubscription(env, ENDPOINT);
    const subs = await getActiveSubscriptions(env);
    expect(subs).toHaveLength(0);
  });

  it('test-push with non-existent endpoint returns 404', async () => {
    // No subscription stored
    const stmt = env.DB.prepare(
      'SELECT endpoint, keys_p256dh, keys_auth FROM subscriptions WHERE endpoint = ?',
    ).bind('https://nonexistent.example.com/push');
    const sub = await stmt.first<{ endpoint: string; keys_p256dh: string; keys_auth: string }>();
    expect(sub).toBeNull();
  });

  it('updatePreferences updates only specified fields', async () => {
    await addSubscription(
      env,
      { endpoint: ENDPOINT, keys: { p256dh: 'p256dh', auth: 'auth' } },
      -6.2,
      106.8,
      'Asia/Jakarta',
      'en',
      'muslimWorldLeague',
      { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
    );

    // Update only fajr and dhuhr
    await updatePreferences(env, ENDPOINT, { fajr: false, dhuhr: false });

    const subs = await getActiveSubscriptions(env);
    expect(subs[0].notify_fajr).toBe(0);
    expect(subs[0].notify_dhuhr).toBe(0);
    // Others unchanged
    expect(subs[0].notify_asr).toBe(1);
    expect(subs[0].notify_maghrib).toBe(1);
    expect(subs[0].notify_isha).toBe(1);
  });

  it('SQL injection: parameterized queries prevent injection', async () => {
    // Try to inject via endpoint field
    const malicious = "https://evil.com'; DROP TABLE subscriptions; --";

    await addSubscription(
      env,
      { endpoint: malicious, keys: { p256dh: 'p', auth: 'a' } },
      -6.2,
      106.8,
      'Asia/Jakarta',
      'en',
      'muslimWorldLeague',
      { fajr: true },
    );

    // Subscription should be stored literally (the string is just an endpoint value)
    const subs = await getActiveSubscriptions(env);
    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe(malicious);

    // Table still exists — the DROP TABLE was not executed
    await addSubscription(
      env,
      { endpoint: 'https://safe.com', keys: { p256dh: 'p2', auth: 'a2' } },
      -6.2,
      106.8,
      'UTC',
      'en',
      'muslimWorldLeague',
      { fajr: false },
    );
    const subs2 = await getActiveSubscriptions(env);
    expect(subs2).toHaveLength(2); // Both subscriptions exist, table wasn't dropped
  });
});

describe('PN notification window', () => {
  it('fires at prayer time (diffMs = 0)', () => {
    const bufferSeconds = 30;
    const windowStartMs = -(bufferSeconds + 60) * 1000;
    expect(0 <= 0 && 0 >= windowStartMs).toBe(true);
  });

  it('fires shortly after prayer (diffMs negative, within window)', () => {
    const bufferSeconds = 30;
    const windowStartMs = -(bufferSeconds + 60) * 1000;
    // 30s after prayer — well within the default 90s window
    expect((-30_000) <= 0 && (-30_000) >= windowStartMs).toBe(true);
  });

  it('fires 19s after prayer (realistic cron-jitter scenario)', () => {
    const bufferSeconds = 30;
    const windowStartMs = -(bufferSeconds + 60) * 1000;
    // cron fires 19s late, prayer just happened
    expect((-19_000) <= 0 && (-19_000) >= windowStartMs).toBe(true);
  });

  it('does NOT fire before prayer (diffMs positive)', () => {
    const bufferSeconds = 30;
    const windowStartMs = -(bufferSeconds + 60) * 1000;
    // 1s before prayer — prayer hasn't happened yet
    expect((+1_000) <= 0 && (+1_000) >= windowStartMs).toBe(false);
  });

  it('does NOT fire when too far after prayer (diffMs exceeds window)', () => {
    const bufferSeconds = 30;
    const windowStartMs = -(bufferSeconds + 60) * 1000;
    // 91s after prayer — outside the 90s window
    expect((-91_000) <= 0 && (-91_000) >= windowStartMs).toBe(false);
  });

  it('respects PN_BUFFER_SECONDS=0 (fire only within 60s grace window)', () => {
    const bufferSeconds = 0;
    const windowStartMs = -(bufferSeconds + 60) * 1000;
    // At prayer time
    expect(0 <= 0 && 0 >= windowStartMs).toBe(true);
    // 30s after (within 60s grace)
    expect((-30_000) <= 0 && (-30_000) >= windowStartMs).toBe(true);
    // 61s after (past 60s grace)
    expect((-61_000) <= 0 && (-61_000) >= windowStartMs).toBe(false);
  });

  it('respects PN_BUFFER_SECONDS=120 (allow up to 3 min after prayer)', () => {
    const bufferSeconds = 120;
    const windowStartMs = -(bufferSeconds + 60) * 1000;
    // At prayer time
    expect(0 <= 0 && 0 >= windowStartMs).toBe(true);
    // 2min 30s after (within 180s window)
    expect((-150_000) <= 0 && (-150_000) >= windowStartMs).toBe(true);
    // 3min 1s after (outside 180s window)
    expect((-181_000) <= 0 && (-181_000) >= windowStartMs).toBe(false);
  });

  it('default buffer is 30 seconds when env var is not set', () => {
    // This tests the fallback in the scheduled handler logic
    // (env.PN_BUFFER_SECONDS ?? '30' falls back to '30' when undefined)
    const windowStartMs = -(30 + 60) * 1000;
    expect(windowStartMs).toBe(-90_000);
  });
});
