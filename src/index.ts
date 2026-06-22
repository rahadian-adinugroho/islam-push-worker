import {
  getTodayPrayerTimes,
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
import { log, initLogger } from './logger';
import { corsHeaders } from './cors';
import { normalizeLocale, normalizeCalcMethod } from './i18n';
import { getTimezoneFromCoords } from './timezone';

export interface Env {
  DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  LOG_LEVEL?: string;
  /** How many seconds after the prayer time the PN should fire. Default 30.
   *  Set to 0 to fire at the exact prayer time (within cron-jitter tolerance). */
  PN_BUFFER_SECONDS?: string;
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    initLogger(env);
    const origin = request.headers.get('Origin');
    const headers = corsHeaders(origin);
    const url = new URL(request.url);

    log.debug(`[fetch] ${request.method} ${url.pathname}`);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405, headers);
    }

    try {
      const body = (await request.json()) as Record<string, unknown>;

      switch (url.pathname) {
        case '/api/subscribe': {
          const { endpoint, keys, lat, lng, timezone, locale, calcMethod, prefs } = body as {
            endpoint?: string;
            keys?: { p256dh?: string; auth?: string };
            lat?: number;
            lng?: number;
            timezone?: string;
            locale?: string;
            calcMethod?: string;
            prefs?: Record<string, boolean>;
          };

          if (!endpoint || !keys?.p256dh || !keys?.auth || lat == null || lng == null) {
            log.warn(`[subscribe] rejected: missing fields from ${endpoint?.slice(0, 50) ?? 'unknown'}`);
            return jsonResponse({ error: 'Missing required fields: endpoint, keys, lat, lng' }, 400, headers);
          }

          const preferences = prefs ?? {};
          const normalizedLocale = normalizeLocale(locale);
          const normalizedMethod = normalizeCalcMethod(calcMethod);
          await addSubscription(env, { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, lat, lng, timezone, normalizedLocale, normalizedMethod, preferences);
          log.info(`[subscribe] ok: ${endpoint.slice(0, 50)}... tz=${timezone} lat=${lat.toFixed(2)} locale=${normalizedLocale} method=${normalizedMethod} prefs=${JSON.stringify(preferences)}`);
          return jsonResponse({ ok: true }, 200, headers);
        }

        case '/api/unsubscribe': {
          const { endpoint } = body as { endpoint?: string };
          if (!endpoint) {
            return jsonResponse({ error: 'Missing endpoint' }, 400, headers);
          }

          await removeSubscription(env, endpoint);
          log.info(`[unsubscribe] ok: ${endpoint.slice(0, 50)}...`);
          return jsonResponse({ ok: true }, 200, headers);
        }

        case '/api/preferences': {
          const { endpoint, prefs } = body as { endpoint?: string; prefs?: Record<string, boolean> };
          if (!endpoint || !prefs) {
            return jsonResponse({ error: 'Missing endpoint or prefs' }, 400, headers);
          }

          await updatePreferences(env, endpoint, prefs);
          log.info(`[preferences] ok: ${endpoint.slice(0, 50)}... prefs=${JSON.stringify(prefs)}`);
          return jsonResponse({ ok: true }, 200, headers);
        }

        case '/api/test-push': {
          // Debug endpoint: send a push to a specific subscription on demand.
          // Looks up the subscription from D1 (parameterized query, safe from
          // SQL injection) and sends a test push via web-push.
          const { endpoint, prayer = 'fajr' } = body as {
            endpoint?: string;
            prayer?: string;
          };

          if (!endpoint) {
            return jsonResponse({ error: 'Missing endpoint' }, 400, headers);
          }

          const sub = await env.DB.prepare(
            'SELECT endpoint, keys_p256dh, keys_auth, locale FROM subscriptions WHERE endpoint = ?',
          )
            .bind(endpoint)
            .first<{ endpoint: string; keys_p256dh: string; keys_auth: string; locale: string }>();

          if (!sub) {
            log.warn(`[test-push] subscription not found: ${endpoint.slice(0, 50)}...`);
            return jsonResponse({ error: 'Subscription not found' }, 404, headers);
          }

          const result = await sendPush(env, {
            endpoint: sub.endpoint,
            keys_p256dh: sub.keys_p256dh,
            keys_auth: sub.keys_auth,
          }, prayer as PrayerName, normalizeLocale(sub.locale));
          log.info(`[test-push] result for ${endpoint.slice(0, 50)}... prayer=${prayer}: ok=${result.ok} statusCode=${result.statusCode ?? 'n/a'}`);
          return jsonResponse(result, result.ok ? 200 : 500, headers);
        }

        default:
          log.warn(`[fetch] 404: ${url.pathname}`);
          return jsonResponse({ error: 'Not Found' }, 404, headers);
      }
    } catch (err) {
      log.error(`[fetch] error: ${err instanceof Error ? err.message : String(err)}`);
      return jsonResponse({ error: 'Internal Server Error' }, 500, headers);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    initLogger(env);
    const startTime = Date.now();
    log.info(`[scheduled] cron triggered at ${new Date().toISOString()}`);

    const subscriptions = await getActiveSubscriptions(env);
    log.debug(`[scheduled] found ${subscriptions.length} active subscription(s)`);

    let pushesSent = 0;
    let deadRemoved = 0;

    const bufferSeconds = parseInt(env.PN_BUFFER_SECONDS ?? '30', 10);
    // Window: [-(buffer+60)s, 0] — fire from at-prayer-time to
    // (buffer+60)s after. +60s grace covers cron jitter.
    const windowStartMs = -(bufferSeconds + 60) * 1000;

    for (const sub of subscriptions) {
      // Derive timezone from coords — don't trust the client-provided timezone
      const timezone = getTimezoneFromCoords(sub.lat, sub.lng);

      const todayStr = getTodayDateString(timezone);
      const calcMethod = normalizeCalcMethod(sub.calc_method);
      const prayerTimes = getTodayPrayerTimes(sub.lat, sub.lng, calcMethod, timezone);
      const now = Date.now();

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

        // Epoch comparison: timezone-agnostic
        const diffMs = prayerTime.time.getTime() - now;

        // Send notification at or after the prayer time. Better late than early
        // for prayer. diffMs = prayerTime - now, so diffMs <= 0 means prayer
        // is in the past. PN_BUFFER_SECONDS controls how many seconds after
        // the prayer time we allow; +60s grace covers cron jitter (cron is
        // every minute). last_notified guard prevents double-firing.
        if (diffMs <= 0 && diffMs >= windowStartMs) {
          log.debug(`[scheduled] sending PN: sub=${sub.endpoint.slice(0, 50)}... prayer=${prayer.name} diffMs=${diffMs} ts=${new Date().toISOString()}`);
          const result = await sendPush(env, sub, prayer.name, normalizeLocale(sub.locale));
          if (result.ok) {
            await markNotified(env, sub.endpoint, prayer.name, todayStr);
            pushesSent++;
          } else if (result.statusCode === 404 || result.statusCode === 410) {
            // Subscription expired / removed — clean up
            await removeSubscription(env, sub.endpoint);
            deadRemoved++;
          }
        }
      }
    }

    const elapsedMs = Date.now() - startTime;
    log.info(`[scheduled] done in ${elapsedMs}ms: ${pushesSent} push(es) sent, ${deadRemoved} dead subscription(s) removed (buffer=${bufferSeconds}s)`);
  },
};
