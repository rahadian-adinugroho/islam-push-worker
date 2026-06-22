import type { PrayerName } from './prayer-times';

export interface PushSubscription {
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  lat: number;
  lng: number;
  timezone: string;
  locale: string;
  calc_method: string;
  notify_fajr: number;
  notify_dhuhr: number;
  notify_asr: number;
  notify_maghrib: number;
  notify_isha: number;
  last_notified_prayer: string | null;
  last_notified_date: string | null;
}

export interface SubscriptionPreferences {
  fajr?: boolean;
  dhuhr?: boolean;
  asr?: boolean;
  maghrib?: boolean;
  isha?: boolean;
}

const SUBSCRIPTION_COLUMNS =
  'endpoint, keys_p256dh, keys_auth, lat, lng, timezone, locale, calc_method, ' +
  'notify_fajr, notify_dhuhr, notify_asr, notify_maghrib, notify_isha, ' +
  'last_notified_prayer, last_notified_date';

export async function addSubscription(
  env: { DB: D1Database },
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  lat: number,
  lng: number,
  timezone: string | undefined,
  locale: string,
  calcMethod: string,
  preferences: SubscriptionPreferences,
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO subscriptions (
      endpoint, keys_p256dh, keys_auth, lat, lng, timezone, locale, calc_method,
      notify_fajr, notify_dhuhr, notify_asr, notify_maghrib, notify_isha
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      sub.endpoint,
      sub.keys.p256dh,
      sub.keys.auth,
      lat,
      lng,
      timezone,
      locale,
      calcMethod,
      preferences.fajr ? 1 : 0,
      preferences.dhuhr ? 1 : 0,
      preferences.asr ? 1 : 0,
      preferences.maghrib ? 1 : 0,
      preferences.isha ? 1 : 0,
    )
    .run();
}

export async function removeSubscription(
  env: { DB: D1Database },
  endpoint: string,
): Promise<void> {
  await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?')
    .bind(endpoint)
    .run();
}

export async function updatePreferences(
  env: { DB: D1Database },
  endpoint: string,
  preferences: SubscriptionPreferences,
): Promise<void> {
  const setClauses: string[] = [];
  const values: (number | string)[] = [];

  if (preferences.fajr !== undefined) {
    setClauses.push('notify_fajr = ?');
    values.push(preferences.fajr ? 1 : 0);
  }
  if (preferences.dhuhr !== undefined) {
    setClauses.push('notify_dhuhr = ?');
    values.push(preferences.dhuhr ? 1 : 0);
  }
  if (preferences.asr !== undefined) {
    setClauses.push('notify_asr = ?');
    values.push(preferences.asr ? 1 : 0);
  }
  if (preferences.maghrib !== undefined) {
    setClauses.push('notify_maghrib = ?');
    values.push(preferences.maghrib ? 1 : 0);
  }
  if (preferences.isha !== undefined) {
    setClauses.push('notify_isha = ?');
    values.push(preferences.isha ? 1 : 0);
  }

  if (setClauses.length === 0) return;

  values.push(endpoint);
  await env.DB.prepare(
    `UPDATE subscriptions SET ${setClauses.join(', ')} WHERE endpoint = ?`,
  )
    .bind(...values)
    .run();
}

export async function getActiveSubscriptions(
  env: { DB: D1Database },
): Promise<PushSubscription[]> {
  const result = await env.DB.prepare(
    `SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions`,
  ).all<PushSubscription>();
  return result.results;
}

export async function markNotified(
  env: { DB: D1Database },
  endpoint: string,
  prayer: string,
  date: string,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE subscriptions SET last_notified_prayer = ?, last_notified_date = ? WHERE endpoint = ?',
  )
    .bind(prayer, date, endpoint)
    .run();
}
