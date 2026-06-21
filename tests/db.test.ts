import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { D1Database, D1Result } from '@cloudflare/workers-types';

// ---------------------------------------------------------------------------
// In-memory mock of the D1Database API used by our query helpers
// ---------------------------------------------------------------------------
interface Row {
  [col: string]: unknown;
}

function createMockDB(): { db: D1Database; dump: () => Row[] } {
  const table = new Map<string, Row[]>();

  const getRows = (sql: string): Row[] => {
    // Extract table name from simple SQL statements
    const match = sql.match(
      /(?:FROM|INTO|UPDATE|REPLACE INTO)\s+(\w+)/i,
    );
    const tbl = match?.[1] ?? 'subscriptions';
    if (!table.has(tbl)) table.set(tbl, []);
    return table.get(tbl)!;
  };

  // -----------------------------------------------------------------------
  // Lightweight D1 prepared-statement mock
  //   prepare(sql).all()         — read-only (no bind)
  //   prepare(sql).bind(a).run() — write with params
  //   prepare(sql).bind(a).all() — read with params
  // -----------------------------------------------------------------------
  const nextResult = (rows: Row[]) =>
    ({
      success: true,
      results: rows,
      meta: { duration: 0, changes: 0, last_row_id: 0, served_by: 'mock' },
    }) as D1Result<Row>;

  const execRead = (sql: string, args: unknown[]): Row[] => {
    const stmt = sql.trim();
    if (!stmt.startsWith('SELECT')) return [];
    const rows = getRows(stmt);
    if (args.length > 0 && stmt.includes('WHERE endpoint = ?')) {
      return rows.filter((r) => r.endpoint === args[0]);
    }
    return rows;
  };

  const execWrite = (sql: string, args: unknown[]) => {
    const stmt = sql.trim();
    if (args.length === 0) return;

    if (stmt.startsWith('INSERT') || stmt.startsWith('INSERT OR REPLACE')) {
      const rows = getRows(stmt);
      const keys = ['endpoint', 'keys_p256dh', 'keys_auth', 'lat', 'lng', 'timezone', 'locale', 'calc_method', 'notify_fajr', 'notify_dhuhr', 'notify_asr', 'notify_maghrib', 'notify_isha'];
      const row: Row = {};
      keys.forEach((k, i) => {
        if (i < args.length) row[k] = args[i];
      });
      const existing = rows.findIndex((r) => r.endpoint === args[0]);
      if (existing >= 0) {
        rows[existing] = row;
      } else {
        rows.push(row);
      }
      return;
    }

    if (stmt.startsWith('UPDATE')) {
      const rows = getRows(stmt);
      const idx = rows.findIndex((r) => r.endpoint === args[args.length - 1]);
      if (idx >= 0) {
        const setMatch = stmt.match(/SET\s+(.+?)\s+WHERE/i);
        if (setMatch) {
          const clauses = setMatch[1].split(',').map((s) => s.trim());
          clauses.forEach((clause, i) => {
            const col = clause.split('=')[0].trim();
            rows[idx][col] = args[i];
          });
        }
      }
      return;
    }

    if (stmt.startsWith('DELETE')) {
      const rows = getRows(stmt);
      if (stmt.includes('WHERE endpoint = ?') && args.length > 0) {
        const idx = rows.findIndex((r) => r.endpoint === args[0]);
        if (idx >= 0) rows.splice(idx, 1);
      }
    }
  };

  const makeStmt = (sql: string, args: unknown[]) => ({
    all: async <T = Row>() => nextResult(execRead(sql, args)) as unknown as D1Result<T>,
    first: async <T = Row>() => (execRead(sql, args)[0] ?? null) as T | null,
    run: async () => {
      execWrite(sql, args);
      return nextResult([]);
    },
    bind: (...nextArgs: unknown[]) => makeStmt(sql, nextArgs),
  });

  const db = {
    prepare: (sql: string) => makeStmt(sql, []),
  } as unknown as D1Database;

  return {
    db,
    dump: () => [...(table.get('subscriptions') ?? [])],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
import {
  addSubscription,
  removeSubscription,
  updatePreferences,
  getActiveSubscriptions,
  markNotified,
} from '../src/db';

describe('db helpers', () => {
  let mock: ReturnType<typeof createMockDB>;
  let env: { DB: D1Database };

  beforeEach(() => {
    mock = createMockDB();
    env = { DB: mock.db };
  });

  it('addSubscription inserts a row', async () => {
    await addSubscription(
      env,
      { endpoint: 'https://example.com/push/1', keys: { p256dh: 'key1', auth: 'auth1' } },
      -6.2,
      106.8,
      'Asia/Jakarta',
      'en',
      'muslimWorldLeague',
      { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
    );
    const rows = mock.dump();
    expect(rows).toHaveLength(1);
    expect(rows[0].endpoint).toBe('https://example.com/push/1');
    expect(rows[0].notify_fajr).toBe(1);
  });

  it('addSubscription upserts on duplicate endpoint', async () => {
    await addSubscription(env, { endpoint: 'ep1', keys: { p256dh: 'a', auth: 'b' } }, 0, 0, 'UTC', 'en', 'muslimWorldLeague', { fajr: false });
    await addSubscription(env, { endpoint: 'ep1', keys: { p256dh: 'a', auth: 'b' } }, 0, 0, 'UTC', 'en', 'muslimWorldLeague', { fajr: true });
    const rows = mock.dump();
    expect(rows).toHaveLength(1);
    expect(rows[0].notify_fajr).toBe(1);
  });

  it('removeSubscription deletes the row', async () => {
    await addSubscription(env, { endpoint: 'ep1', keys: { p256dh: 'a', auth: 'b' } }, 0, 0, 'UTC', 'en', 'muslimWorldLeague', {});
    expect(mock.dump()).toHaveLength(1);
    await removeSubscription(env, 'ep1');
    expect(mock.dump()).toHaveLength(0);
  });

  it('updatePreferences updates only specified fields', async () => {
    await addSubscription(env, { endpoint: 'ep1', keys: { p256dh: 'a', auth: 'b' } }, 0, 0, 'UTC', 'en', 'muslimWorldLeague', {
      fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true,
    });
    await updatePreferences(env, 'ep1', { fajr: false, maghrib: false });
    const rows = mock.dump();
    expect(rows[0].notify_fajr).toBe(0);
    expect(rows[0].notify_dhuhr).toBe(1); // unchanged
    expect(rows[0].notify_asr).toBe(1);
    expect(rows[0].notify_maghrib).toBe(0);
    expect(rows[0].notify_isha).toBe(1);
  });

  it('updatePreferences does nothing when preferences object is empty', async () => {
    await addSubscription(env, { endpoint: 'ep1', keys: { p256dh: 'a', auth: 'b' } }, 0, 0, 'UTC', 'en', 'muslimWorldLeague', { fajr: true });
    await updatePreferences(env, 'ep1', {});
    const rows = mock.dump();
    expect(rows[0].notify_fajr).toBe(1);
  });

  it('getActiveSubscriptions returns all rows', async () => {
    await addSubscription(env, { endpoint: 'ep1', keys: { p256dh: 'a', auth: 'b' } }, 0, 0, 'UTC', 'en', 'muslimWorldLeague', {});
    await addSubscription(env, { endpoint: 'ep2', keys: { p256dh: 'c', auth: 'd' } }, 1, 1, 'Asia/Jakarta', 'id', 'singapore', {});
    const subs = await getActiveSubscriptions(env);
    expect(subs).toHaveLength(2);
  });

  it('addSubscription stores locale and calc_method', async () => {
    await addSubscription(env, { endpoint: 'ep-id', keys: { p256dh: 'a', auth: 'b' } }, 0, 0, 'Asia/Jakarta', 'id', 'singapore', { fajr: true });
    const rows = mock.dump();
    expect(rows[0].locale).toBe('id');
    expect(rows[0].calc_method).toBe('singapore');
  });

  it('markNotified sets last_notified fields', async () => {
    await addSubscription(env, { endpoint: 'ep1', keys: { p256dh: 'a', auth: 'b' } }, 0, 0, 'UTC', 'en', 'muslimWorldLeague', {});
    await markNotified(env, 'ep1', 'maghrib', '2026-06-21');
    const rows = mock.dump();
    expect(rows[0].last_notified_prayer).toBe('maghrib');
    expect(rows[0].last_notified_date).toBe('2026-06-21');
  });
});
