/**
 * Check whether a notification should be sent based on the time difference
 * between now and the prayer time, and the configured buffer.
 *
 * diffMs > 0  → prayer is in the past (notification fires after prayer)
 * diffMs = 0  → prayer is happening now
 * diffMs < 0  → prayer is in the future (notification not yet sent)
 *
 * The window is: 0 <= diffMs <= (bufferSeconds + 60) * 1000
 * The +60 seconds is grace for cron jitter (cron runs every minute).
 * The `last_notified` guard in the scheduled handler prevents double-firing.
 */
export function shouldSendNotification(diffMs: number, bufferSeconds: number): boolean {
  const windowEndMs = (bufferSeconds + 60) * 1000;
  return diffMs >= 0 && diffMs <= windowEndMs;
}
