import {
  getTodayPrayerTimes,
  getPrayerTimeMinutes,
  getCurrentLocalMinutes,
  getTodayDateString,
  type PrayerName,
} from './prayer-times';
import {
  addSubscription,
  removeSubscription,
  updatePreferences,
  getActiveSubscriptions,
  markNotified,
} from './db';
import { sendPush } from './push';

export interface Env {
  DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

const ALLOWED_ORIGINS = ['https://islam.raharoho.me', 'http://localhost:5173'];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : 'https://islam.raharoho.me';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    const headers = corsHeaders(origin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405, headers);
    }

    const url = new URL(request.url);

    try {
      const body = (await request.json()) as Record<string, unknown>;

      switch (url.pathname) {
        case '/api/subscribe': {
          const { endpoint, keys, lat, lng, timezone, preferences } = body as {
            endpoint?: string;
            keys?: { p256dh?: string; auth?: string };
            lat?: number;
            lng?: number;
            timezone?: string;
            preferences?: Record<string, boolean>;
          };

          if (!endpoint || !keys?.p256dh || !keys?.auth || lat == null || lng == null || !timezone) {
            return jsonResponse({ error: 'Missing required fields: endpoint, keys, lat, lng, timezone' }, 400, headers);
          }

          await addSubscription(env, { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, lat, lng, timezone, preferences ?? {});
          return jsonResponse({ ok: true }, 200, headers);
        }

        case '/api/unsubscribe': {
          const { endpoint } = body as { endpoint?: string };
          if (!endpoint) {
            return jsonResponse({ error: 'Missing endpoint' }, 400, headers);
          }

          await removeSubscription(env, endpoint);
          return jsonResponse({ ok: true }, 200, headers);
        }

        case '/api/preferences': {
          const { endpoint, preferences } = body as { endpoint?: string; preferences?: Record<string, boolean> };
          if (!endpoint || !preferences) {
            return jsonResponse({ error: 'Missing endpoint or preferences' }, 400, headers);
          }

          await updatePreferences(env, endpoint, preferences);
          return jsonResponse({ ok: true }, 200, headers);
        }

        default:
          return jsonResponse({ error: 'Not Found' }, 404, headers);
      }
    } catch (err) {
      return jsonResponse({ error: 'Internal Server Error' }, 500, headers);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const subscriptions = await getActiveSubscriptions(env);

    for (const sub of subscriptions) {
      const prayerTimes = getTodayPrayerTimes(sub.lat, sub.lng);
      const currentLocalMinutes = getCurrentLocalMinutes(sub.timezone);
      const todayStr = getTodayDateString(sub.timezone);

      const prayerChecks: { name: PrayerName; enabled: boolean }[] = [
        { name: 'fajr', enabled: sub.notify_fajr === 1 },
        { name: 'dhuhr', enabled: sub.notify_dhuhr === 1 },
        { name: 'asr', enabled: sub.notify_asr === 1 },
        { name: 'maghrib', enabled: sub.notify_maghrib === 1 },
        { name: 'isha', enabled: sub.notify_isha === 1 },
      ];

      for (const prayer of prayerChecks) {
        if (!prayer.enabled) continue;

        const prayerTime = prayerTimes.find((pt) => pt.id === prayer.name);
        if (!prayerTime) continue;

        // Already notified for this prayer today
        if (sub.last_notified_date === todayStr && sub.last_notified_prayer === prayer.name) {
          continue;
        }

        const prayerMinutes = getPrayerTimeMinutes(prayerTime.time);
        const diff = prayerMinutes - currentLocalMinutes;

        // Send notification within 0–1 minutes before the prayer time
        if (diff >= 0 && diff <= 1) {
          const result = await sendPush(env, sub, prayer.name);
          if (result.ok) {
            await markNotified(env, sub.endpoint, prayer.name, todayStr);
          } else if (result.statusCode === 404 || result.statusCode === 410) {
            // Subscription expired / removed — clean up
            await removeSubscription(env, sub.endpoint);
          }
        }
      }
    }
  },
};
