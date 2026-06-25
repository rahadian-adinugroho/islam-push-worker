# AGENTS.md

Context for AI agents working in this repository. Read this first before making changes.

## What this is

Cloudflare Worker that sends push notifications for prayer times to the islam.raharoho.me PWA. Runs every minute via cron, computes prayer times per subscriber's coordinates + calculation method, and delivers VAPID-signed web push notifications.

The PWA frontend is in a separate repo ([website/islam](https://github.com/rahadian-adinugroho/website/tree/main/islam)). This repo is the backend that fires the PNs.

## Tech stack

- **TypeScript** — strict mode
- **Cloudflare Workers** — V8 isolate runtime, `nodejs_compat` enabled (for `web-push` library's `https.request`)
- **D1** — serverless SQLite for subscription storage
- **web-push** — VAPID push delivery
- **adhan** — prayer time calculation
- **@photostructure/tz-lookup** — IANA timezone derivation from lat/lng (client timezone is unreliable due to privacy shields)
- **Vitest** — unit tests
- **Bun** — package manager
- **1Password CLI (`op run`)** — secret injection for `VAPID_PRIVATE_KEY`

## Common commands

```bash
# Install
bun install

# Dev server (with secrets from 1Password)
op run -- wrangler dev

# Apply D1 migrations locally
wrangler d1 migrations apply islam-push-db --local

# Tests
bun run test               # one-shot
bun run test:watch         # watch mode
bun run test:coverage      # with coverage (informational, not a CI gate)

# Typecheck
bun run typecheck          # bunx tsc --noEmit

# Deploy
op run -- bun run deploy   # secrets injected from 1Password
```

## Directory structure

```
/
├── src/                 # TypeScript source
│   ├── index.ts         # fetch handlers + scheduled cron handler
│   ├── push.ts          # VAPID-signed push delivery
│   ├── prayer-times.ts  # adhan wrapper with ihtiyat adjustments
│   ├── db.ts            # D1 query helpers
│   ├── i18n.ts          # locale + calc method normalization
│   ├── timezone.ts      # timezone derivation from coords via geo-tz
│   ├── cors.ts          # CORS header generation
│   ├── logger.ts        # level-based logger
│   └── notification-window.ts  # shouldSendNotification helper
├── tests/               # Vitest tests (one file per src/ module)
├── migrations/          # D1 migrations (0001, 0002, 0003, 0004)
├── wrangler.toml        # Cloudflare Workers config
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .github/workflows/   # test.yml (PR) + deploy.yml (main)
```

## Key files

- **`src/index.ts`** — main entry. `fetch` handler (subscribe/unsubscribe/preferences/test-push endpoints) and `scheduled` handler (cron). The scheduled handler is the hot path.
- **`src/prayer-times.ts`** — `getTodayPrayerTimes(lat, lng, method, timezone?)`. The `singapore` case applies Kemenag RI ihtiyat adjustments (`+2 min` to all prayers, `-2 min` for sunrise). Critical: the PWA must use the same adjustments or PNs fire at the wrong time.
- **`src/i18n.ts`** — `normalizeLocale()` (en/id → 'en' | 'id') and `normalizeCalcMethod()` (defaults to 'singapore'). Used everywhere calc method is read from D1.
- **`src/notification-window.ts`** — `shouldSendNotification(diffMs, bufferSeconds)`. Window is `[-(buffer+60)s, 0]` — fires AT or AFTER the prayer, never before. The +60 is grace for cron jitter.
- **`src/push.ts`** — VAPID push delivery. `sendPush()` accepts an optional `ttl` parameter (env: `PN_TTL_SECONDS`, default 6 hours) to discard stale notifications.
- **`src/timezone.ts`** — `getTimezoneFromCoords()` via `@photostructure/tz-lookup`. Replaces client-provided timezone (which can be obfuscated).
- **`migrations/`** — D1 schema migrations. `deploy.yml` runs `wrangler d1 migrations apply` before deploy.

## D1 schema

The `subscriptions` table:

```
endpoint TEXT PK              -- push subscription URL
keys_p256dh TEXT NOT NULL
keys_auth TEXT NOT NULL
lat REAL NOT NULL
lng REAL NOT NULL
timezone TEXT NOT NULL        -- stored but not trusted (derived from coords)
locale TEXT NOT NULL          -- 'en' or 'id'
calc_method TEXT NOT NULL     -- 'singapore', 'ummAlQura', etc.
notify_fajr INTEGER DEFAULT 1
notify_dhuhr INTEGER DEFAULT 1
notify_asr INTEGER DEFAULT 1
notify_maghrib INTEGER DEFAULT 1
notify_isha INTEGER DEFAULT 1
last_notified_prayer TEXT
last_notified_date TEXT       -- YYYY-MM-DD in user's local timezone
created_at TEXT DEFAULT (datetime('now'))
```

## Environment variables

### Plain text (`wrangler.toml [vars]`)

| Var | Default | Description |
|---|---|---|
| `VAPID_PUBLIC_KEY` | *(set)* | VAPID public key for Web Push |
| `VAPID_SUBJECT` | *(set)* | `mailto:` URL for VAPID contact |
| `LOG_LEVEL` | `debug` | debug, info, warn, error, none |
| `PN_BUFFER_SECONDS` | `30` | Seconds after prayer time to fire PN |
| `PN_TTL_SECONDS` | `21600` | Seconds push service retains offline messages (6h default) |

### Secrets (`wrangler secret put`)

| Secret | Description |
|---|---|
| `VAPID_PRIVATE_KEY` | VAPID private key (also stored in 1Password) |

## Conventions

- **Branch workflow**: branch off `main`, open a PR, never push to main
- **Co-authored-by trailer** — every AI-generated commit must end with:
  ```
  Co-authored-by: MiniMax-M3 (OpenCode Go) <noreply@MiniMax.local>
  ```
- **TypeScript strict** — no `any` unless absolutely necessary (4 pre-existing typecheck errors from adhan/D1 mocks, unrelated to changes)
- **Tests required** — new logic needs tests. Use `vi.mock` / `vi.spyOn` for mocking. `tests/notification-window.test.ts` is a good reference for the "extract pure function + test" pattern.
- **PN window is asymmetric** — fires at or AFTER the prayer time, never before. Better late than early for prayer.
- **Epoch comparison** — use `prayerTime.getTime() - now`, NOT `prayerTime.getHours()` (which returns system-local hours and is broken in UTC Workers).

## Related repos

- **[website/islam](https://github.com/rahadian-adinugroho/website/tree/main/islam)** — the PWA frontend. The Worker receives subscriptions from this. Deploy order: Worker first (D1 migration + ihtiyat fix), then Website.
- **[website/AGENTS.md](https://github.com/rahadian-adinugroho/website/blob/main/AGENTS.md)** — context for the website repo.

## Common tasks

### Add a new calculation method

1. Add the method to the `VALID_METHODS` set in `src/i18n.ts`
2. Add the case in `getCalculationMethod()` in `src/prayer-times.ts`
3. Add tests in `tests/prayer-times.test.ts` and `tests/calc-method-regression.test.ts`
4. Update the PWA's `getAdhanCalculationMethod()` in `website/islam/src/lib/settings.ts` (if the method name differs)

### Add a new env var

1. Add to `Env` interface in `src/index.ts`
2. Read it where needed (e.g., `parseInt(env.MY_VAR ?? 'default', 10)`)
3. Add to `wrangler.toml [vars]` with a comment
4. Add tests that mock the env var

### Add a new D1 column

1. Create `migrations/000N_*.sql` with `ALTER TABLE subscriptions ADD COLUMN ...`
2. Update `SUBSCRIPTION_COLUMNS` in `src/db.ts`
3. Update `PushSubscription` interface
4. Update `addSubscription()` to bind the new column
5. Update `getActiveSubscriptions()` SELECT (already covered by `SUBSCRIPTION_COLUMNS`)
6. Update tests in `tests/db.test.ts`
7. The deploy workflow auto-applies migrations before deploy

## Gotchas

- **Cloudflare cron is 19s late** — fires at `:MM:19` instead of `:MM:00`. The 60s grace in `shouldSendNotification()` handles this.
- **Worker runs in UTC** — `.getHours()` returns UTC hours, not local. Use `.getTime()` (epoch ms) for any time math.
- **web-push uses `https.request`** which requires `nodejs_compat` flag in `wrangler.toml`. Don't remove this flag.
- **`normalizeCalcMethod` defaults to 'singapore'** (not MWL). The PWA does the same. This is intentional — the Kemenag RI default is singapore.
- **D1 `read_replication` must be explicitly disabled** in Terraform (`{ mode = "disabled" }`). Don't remove this setting.
- **Migration 0004 is a backfill** — it changes the default of `calc_method` for new rows. Old rows are explicitly backfilled to 'singapore'. Don't drop this migration.
- **The Worker doesn't trust `sub.timezone`** — it's stored in D1 for debugging but always re-derived from `sub.lat`/`sub.lng` via `@photostructure/tz-lookup`. This is by design.
