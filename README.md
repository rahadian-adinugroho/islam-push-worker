# islam-push-worker

Cloudflare Worker that sends push notifications for prayer times to the [islam.raharoho.me](https://islam.raharoho.me) PWA. Runs every minute via cron.

## Features

- **Web Push** via `web-push` (VAPID-signed)
- **Locale-aware** notifications (en/id) — title and body translated per user
- **Per-user calc method** — singapore, MWL, Umm al-Qura, etc., stored in D1
- **Kemenag RI ihtiyat** — `+2 min` offsets for Singapore method (matches PWA)
- **Timezone from coordinates** via `@photostructure/tz-lookup` (client timezone is unreliable due to privacy shields)
- **Late-only PN window** — fires at or after prayer time, configurable via `PN_BUFFER_SECONDS`
- **D1** for subscription storage with push-state tracking

## Architecture

```
src/
├── index.ts              # fetch + scheduled handlers
├── push.ts               # VAPID push delivery
├── prayer-times.ts       # adhan wrapper + ihtiyat adjustments
├── db.ts                 # D1 query helpers
├── i18n.ts               # locale + calc method normalization
├── timezone.ts           # timezone derivation from coords
├── notification-window.ts # shouldSendNotification helper
├── cors.ts               # CORS
└── logger.ts             # level-based logger
```

## D1 schema

```
subscriptions (
  endpoint TEXT PRIMARY KEY,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  timezone TEXT NOT NULL,        -- stored but not trusted
  locale TEXT NOT NULL,          -- 'en' or 'id'
  calc_method TEXT NOT NULL,     -- 'singapore', 'ummAlQura', etc.
  notify_fajr INTEGER DEFAULT 1,
  notify_dhuhr INTEGER DEFAULT 1,
  notify_asr INTEGER DEFAULT 1,
  notify_maghrib INTEGER DEFAULT 1,
  notify_isha INTEGER DEFAULT 1,
  last_notified_prayer TEXT,
  last_notified_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)
```

## Migrations

Apply locally: `wrangler d1 migrations apply islam-push-db --local`

Apply on deploy: handled automatically by `.github/workflows/deploy.yml`.

| File | Purpose |
|---|---|
| `0001_init.sql` | Create subscriptions table |
| `0002_add_locale.sql` | Add `locale` column |
| `0003_add_calc_method.sql` | Add `calc_method` column (default MWL) |
| `0004_fix_default_calc_method.sql` | Backfill old rows to `singapore` |

## Environment variables

### `wrangler.toml [vars]`

| Var | Default | Description |
|---|---|---|
| `VAPID_PUBLIC_KEY` | *(set)* | VAPID public key |
| `VAPID_SUBJECT` | *(set)* | `mailto:` URL for VAPID contact |
| `LOG_LEVEL` | `debug` | debug / info / warn / error / none |
| `PN_BUFFER_SECONDS` | `30` | Seconds after prayer time to fire PN |
| `PN_TTL_SECONDS` | `21600` | Seconds push service retains offline messages (6h) |

### Secrets (via `wrangler secret put`)

| Secret | Description |
|---|---|
| `VAPID_PRIVATE_KEY` | VAPID private key (also in 1Password, injected via `op run --`) |

## Local development

```bash
bun install
op run -- wrangler dev              # dev server with secrets from 1Password
bun run test                         # vitest
bun run test:coverage                # with coverage
bun run typecheck                    # tsc --noEmit
op run -- bun run deploy             # deploy with secrets
```

## CI/CD

| Workflow | Trigger | Action |
|---|---|---|
| `test.yml` | PRs | Run tests |
| `deploy.yml` | Push to `main` | Migrations → deploy to Cloudflare |

Cron trigger: `* * * * *` (every minute).

## Related repos

- **[website/islam](https://github.com/rahadian-adinugroho/website/tree/main/islam)** — the PWA frontend. Deploy order: **Worker first** (D1 migration + ihtiyat fix), then Website.
- **[website/AGENTS.md](https://github.com/rahadian-adinugroho/website/blob/main/AGENTS.md)** — context for the website repo.

## AI agent context

See [AGENTS.md](./AGENTS.md) for repo conventions, common tasks, and gotchas.
