import webpush from 'web-push';
import type { PrayerName } from './prayer-times';
import { log } from './logger';

export interface PushResult {
  ok: boolean;
  statusCode?: number;
}

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
  },
  subscription: {
    endpoint: string;
    keys_p256dh: string;
    keys_auth: string;
  },
  prayer: PrayerName,
): Promise<PushResult> {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );

  const pushSub = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys_p256dh,
      auth: subscription.keys_auth,
    },
  };

  const title = `It's time for ${prayer.charAt(0).toUpperCase() + prayer.slice(1)} prayer`;

  const payload = JSON.stringify({
    title: 'Prayer Time',
    body: title,
    icon: '/icon.png',
    tag: `prayer-${prayer}`,
    data: { prayer },
  });

  try {
    await webpush.sendNotification(pushSub, payload);
    log.debug(`[push] ok: sub=${subscription.endpoint.slice(0, 50)}... prayer=${prayer}`);
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
