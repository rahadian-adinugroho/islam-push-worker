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
import { normalizeLocale, normalizeCalcMethod, type Locale } from './i18n';
import type { PushSubscription } from './db';
import { getTimezoneFromCoords } from './timezone';
import { shouldSendNotification } from './notification-window';

export interface Env {
  DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  LOG_LEVEL?: string;
  /** How many seconds after the prayer time the PN should fire. Default 30.
   *  Set to 0 to fire at the exact prayer time (within cron-jitter tolerance). */
  PN_BUFFER_SECONDS?: string;
  /** How long (in seconds) the push service should retain the message
   *  if the device is offline. Default 21600 (6 hours). After this time,
   *  the message is discarded by the push service. */
  PN_TTL_SECONDS?: string;
  /** Max number of PNs to send per cron execution. Default 50 (Cloudflare
   *  Workers free tier subrequest limit). Tasks beyond this are deferred
   *  to the next cron run (cron is every minute; PN window is ~90s, so a
   *  backlog clears in 1-2 runs). Bump to 1000+ on Workers Paid. */
  PN_BATCH_SIZE?: string;
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

    const bufferSeconds = parseInt(env.PN_BUFFER_SECONDS ?? '30', 10);
    const batchSize = parseInt(env.PN_BATCH_SIZE ?? '50', 10);

    // Build a flat list of push tasks. Each task is an independent (sub, prayer)
    // pair that should be notified. Local CPU only — no awaits in the build phase.
    type PushTask = {
      sub: PushSubscription;
      prayer: PrayerName;
      todayStr: string;
      locale: Locale;
    };
    const tasks: PushTask[] = [];
    let subsIterated = 0;

    for (const sub of subscriptions) {
      // CPU cap: stop building when the batch is full. No point computing
      // adhan math or D1 prep for subs whose PNs would be deferred anyway.
      if (tasks.length >= batchSize) break;
      subsIterated++;

      // Use D1 timezone when available (PWA sends browser-derived timezone on
      // subscribe). Fall back to tz-lookup from coords for legacy rows.
      const timezone = sub.timezone || getTimezoneFromCoords(sub.lat, sub.lng);

      const todayStr = getTodayDateString(timezone);
      const calcMethod = normalizeCalcMethod(sub.calc_method);
      const locale = normalizeLocale(sub.locale);
      log.debug(`[scheduled] sub=${sub.endpoint.slice(0, 50)}... calc_method=${calcMethod} (raw=${sub.calc_method}) tz=${timezone} lat=${sub.lat.toFixed(2)} lng=${sub.lng.toFixed(2)}`);

      const prayerTimes = getTodayPrayerTimes(sub.lat, sub.lng, calcMethod, timezone);
      const prayerTimesByPrayer = new Map(prayerTimes.map((pt) => [pt.id, pt]));
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

        const prayerTime = prayerTimesByPrayer.get(prayer.name);
        if (!prayerTime) continue;

        // Already notified for this prayer today
        if (sub.last_notified_date === todayStr && sub.last_notified_prayer === prayer.name) {
          continue;
        }

        // Epoch comparison: timezone-agnostic
        const diffMs = now - prayerTime.time.getTime();

        // Send notification at or after the prayer time. Better late than early
        // for prayer. PN_BUFFER_SECONDS controls how many seconds after the
        // prayer time we target; +60s grace covers cron jitter (cron is every
        // minute). last_notified guard prevents double-firing.
        if (shouldSendNotification(diffMs, bufferSeconds)) {
          tasks.push({ sub, prayer: prayer.name, todayStr, locale });
        }
      }
    }

    log.debug(`[scheduled] built ${tasks.length} push task(s)`);

    if (tasks.length === 0) {
      const elapsedMs = Date.now() - startTime;
      log.info(`[scheduled] done in ${elapsedMs}ms: nothing to send`);
      return;
    }

    // Slice to batch size. The early-break in the build loop already ensures
    // tasks never exceeds batchSize, so this is effectively a no-op (but kept
    // as defense-in-depth in case the cap logic changes).
    const batch = tasks.slice(0, batchSize);

    const subsDeferred = subscriptions.length - subsIterated;
    if (subsDeferred > 0) {
      log.warn(
        `[scheduled] ${subsDeferred} of ${subscriptions.length} subscription(s) deferred to next cron run (CPU cap reached: ${batchSize} PNs this run)`,
      );
    }

    // Send all push tasks in parallel. Use allSettled (not all) so one user's
    // network error doesn't reject the entire batch and skip markNotified /
    // removeSubscription for everyone else.
    const pushResults = await Promise.allSettled(
      batch.map((task) => sendPush(env, task.sub, task.prayer, task.locale)),
    );

    // Bucket results
    const successes: PushTask[] = [];
    const dead: PushTask[] = [];
    let errors = 0;

    for (let i = 0; i < batch.length; i++) {
      const task = batch[i];
      const r = pushResults[i];
      if (r.status === 'fulfilled') {
        if (r.value.ok) {
          successes.push(task);
        } else if (r.value.statusCode === 404 || r.value.statusCode === 410) {
          dead.push(task);
        }
      } else {
        errors++;
        log.error(`[scheduled] push error: sub=${task.sub.endpoint.slice(0, 50)}... prayer=${task.prayer}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      }
    }

    // D1 writes in parallel. markNotified and removeSubscription are
    // independent — fire them together.
    await Promise.all([
      ...successes.map((t) => markNotified(env, t.sub.endpoint, t.prayer, t.todayStr)),
      ...dead.map((t) => removeSubscription(env, t.sub.endpoint)),
    ]);

    const elapsedMs = Date.now() - startTime;
    log.info(`[scheduled] done in ${elapsedMs}ms: ${successes.length} push(es) sent, ${dead.length} dead, ${errors} error(s) (buffer=${bufferSeconds}s, batch=${batch.length}/${tasks.length}, max=${batchSize})`);
  },
};
