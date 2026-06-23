import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrayerName } from '../src/prayer-times';

// ---------------------------------------------------------------------------
// Mock web-push (vi.hoisted to avoid hoisting issues)
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

const ENV = {
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:test@example.com',
};

const ENV_WITH_TTL = {
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:test@example.com',
  PN_TTL_SECONDS: '3600',
};

const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test',
  keys_p256dh: 'test-p256dh',
  keys_auth: 'test-auth',
};

describe('sendPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { ok: true } when notification succeeds', async () => {
    mockSendNotification.mockResolvedValue({ statusCode: 201 });

    const result = await sendPush(ENV, SUBSCRIPTION, 'maghrib', 'en');

    expect(result).toEqual({ ok: true });
    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      ENV.VAPID_SUBJECT,
      ENV.VAPID_PUBLIC_KEY,
      ENV.VAPID_PRIVATE_KEY,
    );
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const [sub, payload] = mockSendNotification.mock.calls[0];
    expect(sub.endpoint).toBe(SUBSCRIPTION.endpoint);
    expect(sub.keys.p256dh).toBe(SUBSCRIPTION.keys_p256dh);
    expect(sub.keys.auth).toBe(SUBSCRIPTION.keys_auth);

    const parsed = JSON.parse(payload);
    expect(parsed.title).toBe('Maghrib prayer time');
    expect(parsed.body).toBe('The most beloved deed to Allah is the most consistent.');
    expect(parsed.tag).toBe('prayer-maghrib');
  });

  it('returns ok false with statusCode 410 for expired subscription', async () => {
    const error = new Error('Gone') as Error & { statusCode: number };
    error.statusCode = 410;
    mockSendNotification.mockRejectedValue(error);

    const result = await sendPush(ENV, SUBSCRIPTION, 'fajr', 'en');
    expect(result).toEqual({ ok: false, statusCode: 410 });
  });

  it('returns ok false with statusCode 404 for not found subscription', async () => {
    const error = new Error('Not Found') as Error & { statusCode: number };
    error.statusCode = 404;
    mockSendNotification.mockRejectedValue(error);

    const result = await sendPush(ENV, SUBSCRIPTION, 'fajr', 'en');
    expect(result).toEqual({ ok: false, statusCode: 404 });
  });

  it('re-throws errors that are not 404/410', async () => {
    const error = new Error('Network failure');
    mockSendNotification.mockRejectedValue(error);

    await expect(sendPush(ENV, SUBSCRIPTION, 'fajr', 'en')).rejects.toThrow('Network failure');
  });

  it('generates correct tag and body for each prayer in English', async () => {
    mockSendNotification.mockResolvedValue({ statusCode: 201 });

    const prayers: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    for (const prayer of prayers) {
      await sendPush(ENV, SUBSCRIPTION, prayer, 'en');
      const [_, payload] = mockSendNotification.mock.calls[mockSendNotification.mock.calls.length - 1];
      const parsed = JSON.parse(payload);
      expect(parsed.tag).toBe(`prayer-${prayer}`);
      expect(parsed.title).toBe(`${prayer.charAt(0).toUpperCase() + prayer.slice(1)} prayer time`);
      expect(parsed.body).toBe(
        prayer === 'fajr'
          ? 'Prayer is better than sleep!'
          : 'The most beloved deed to Allah is the most consistent.',
      );
    }
  });

  it('uses Indonesian locale for notification title and body', async () => {
    mockSendNotification.mockResolvedValue({ statusCode: 201 });

    await sendPush(ENV, SUBSCRIPTION, 'fajr', 'id');
    const [_, payload] = mockSendNotification.mock.calls[0];
    const parsed = JSON.parse(payload);
    expect(parsed.title).toBe('Waktu Sholat Subuh');
    expect(parsed.body).toBe('Sholat itu lebih baik dari tidur!');
    expect(parsed.tag).toBe('prayer-fajr');
  });

  describe('TTL option', () => {
    it('passes default TTL (21600) when env var is not set', async () => {
      mockSendNotification.mockResolvedValue({ statusCode: 201 });
      await sendPush(ENV, SUBSCRIPTION, 'fajr', 'en');
      expect(mockSendNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { TTL: 21600 },
      );
    });

    it('passes env var TTL when PN_TTL_SECONDS is set', async () => {
      mockSendNotification.mockResolvedValue({ statusCode: 201 });
      await sendPush(ENV_WITH_TTL, SUBSCRIPTION, 'fajr', 'en');
      expect(mockSendNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { TTL: 3600 },
      );
    });

    it('override ttl parameter takes precedence over env var', async () => {
      mockSendNotification.mockResolvedValue({ statusCode: 201 });
      await sendPush(ENV_WITH_TTL, SUBSCRIPTION, 'fajr', 'en', 7200);
      expect(mockSendNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { TTL: 7200 },
      );
    });

    it('passes options as third argument to sendNotification', async () => {
      mockSendNotification.mockResolvedValue({ statusCode: 201 });
      await sendPush(ENV, SUBSCRIPTION, 'fajr', 'en');
      const args = mockSendNotification.mock.calls[0];
      // args: [pushSub, payload, options]
      expect(args).toHaveLength(3);
      expect(args[2]).toEqual({ TTL: 21600 });
    });
  });
});
