import webpush from 'web-push';
import type { PrayerName } from './prayer-times';
import { log } from './logger';
import { getNotificationTitle, type Locale } from './i18n';

export interface PushResult {
  ok: boolean;
  statusCode?: number;
}

/**
 * VAPID config is constant within a single cron run (env values don't change).
 * Track the last-seen values so we only call setVapidDetails when they change,
 * avoiding repeated key validation on every sendPush call.
 */
let lastVapidSubject: string | undefined;
let lastVapidPublicKey: string | undefined;
let lastVapidPrivateKey: string | undefined;

/**
 * VAPID-signed push notification for a given subscription and prayer.
 *
 * Returns `{ ok: true }` on success.
 * Returns `{ ok: false, statusCode: 404 | 410 }` for expired / dead subscriptions
 * so callers can clean up.
 * Re-throws any other error.
 */
export async function sendPush(
  env: {
    VAPID_PUBLIC_KEY: string;
    VAPID_PRIVATE_KEY: string;
    VAPID_SUBJECT: string;
    PN_TTL_SECONDS?: string;
  },
  subscription: {
    endpoint: string;
    keys_p256dh: string;
    keys_auth: string;
  },
  prayer: PrayerName,
  locale: Locale = 'en',
  ttl?: number,
): Promise<PushResult> {
  // Only re-set VAPID details when the env values actually change (e.g., first
  // call in a cron run, or after a config update). Avoids redundant key
  // validation on every push within the same run.
  if (
    lastVapidSubject !== env.VAPID_SUBJECT ||
    lastVapidPublicKey !== env.VAPID_PUBLIC_KEY ||
    lastVapidPrivateKey !== env.VAPID_PRIVATE_KEY
  ) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );
    lastVapidSubject = env.VAPID_SUBJECT;
    lastVapidPublicKey = env.VAPID_PUBLIC_KEY;
    lastVapidPrivateKey = env.VAPID_PRIVATE_KEY;
  }

  const pushSub = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys_p256dh,
      auth: subscription.keys_auth,
    },
  };

  const { title, body } = getNotificationTitle(prayer, locale);

  const payload = JSON.stringify({
    title,
    body,
    icon: '/icon.png',
    tag: `prayer-${prayer}`,
    data: { prayer },
  });

  // Parse TTL from env or use the override. Default 21600s = 6 hours.
  const ttlSeconds = ttl ?? parseInt(env.PN_TTL_SECONDS ?? '21600', 10);

  try {
    await webpush.sendNotification(pushSub, payload, { TTL: ttlSeconds });
    log.debug(`[push] ok: sub=${subscription.endpoint.slice(0, 50)}... prayer=${prayer} ttl=${ttlSeconds}s`);
    return { ok: true };
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode === 404 || err.statusCode === 410) {
      // Dead subscription (user uninstalled PWA or revoked permission) — expected behavior
      log.warn(`[push] dead (${err.statusCode}): sub=${subscription.endpoint.slice(0, 50)}... prayer=${prayer}`);
      return { ok: false, statusCode: err.statusCode };
    }
    // Other errors are unexpected — network issues, VAPID problems, etc.
    log.error(`[push] failed: sub=${subscription.endpoint.slice(0, 50)}... prayer=${prayer} status=${err.statusCode} msg=${err.message}`);
    throw error;
  }
}
