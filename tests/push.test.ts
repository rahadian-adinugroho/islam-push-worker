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
    expect(parsed.title).toBe('Prayer Time');
    expect(parsed.body).toContain('Maghrib');
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
      expect(parsed.title).toBe('Prayer Time');
      const expectedName = prayer.charAt(0).toUpperCase() + prayer.slice(1);
      expect(parsed.body).toContain(expectedName);
    }
  });

  it('uses Indonesian locale for notification title and body', async () => {
    mockSendNotification.mockResolvedValue({ statusCode: 201 });

    await sendPush(ENV, SUBSCRIPTION, 'fajr', 'id');
    const [_, payload] = mockSendNotification.mock.calls[0];
    const parsed = JSON.parse(payload);
    expect(parsed.title).toBe('Waktu Sholat');
    expect(parsed.body).toBe('Waktu Subuh');
    expect(parsed.tag).toBe('prayer-fajr');
  });
});
