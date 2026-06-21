CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  timezone TEXT NOT NULL,
  notify_fajr INTEGER DEFAULT 1,
  notify_dhuhr INTEGER DEFAULT 1,
  notify_asr INTEGER DEFAULT 1,
  notify_maghrib INTEGER DEFAULT 1,
  notify_isha INTEGER DEFAULT 1,
  last_notified_prayer TEXT,
  last_notified_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_date ON subscriptions(last_notified_date);
