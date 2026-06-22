# islam-push-worker

Cloudflare Worker that sends push notifications for prayer times to PWA subscribers. Runs every minute via cron, computes prayer times per user's coordinates and calculation method, and delivers VAPID-signed web push notifications.

## Features

- **Web Push notifications** — VAPID-signed push delivery via `web-push`
- **Scheduled cron handler** — runs every minute to check and fire notifications
- **Locale-aware** — notification title/body in English or Indonesian (`locale` column)
- **Calculation methods** — supports 8 methods (singapore, MWL, UmmAlQura, etc.), stored per user in D1
- **Kemenag RI ihtiyat adjustments** — +2 min precautionary offsets for Singapore method (matches PWA)
- **Timezone from coordinates** — uses `@photostructure/tz-lookup` to derive timezone from lat/lng (no client trust)
- **Epoch-based comparison** — timezone-agnostic prayer time matching using `Date.getTime()`
- **Late-only notification window** — PN fires at or after prayer time, never before (configurable via `PN_BUFFER_SECONDS`)
- **D1 database** — persistent subscription storage with push state tracking

## Architecture

```
src/
├── index.ts          # fetch handlers + scheduled cron handler
├── push.ts           # VAPID-signed push notification delivery
├── prayer-times.ts   # adhan wrapper with ihtiyat adjustments
├── db.ts             # D1 query helpers (CRUD, preferences, notification state)
├── i18n.ts           # locale normalization + calculation method normalization
├── timezone.ts       # timezone derivation from coordinates via geo-tz
├── cors.ts           # CORS header generation
└── logger.ts         # level-based logger (debug/info/warn/error)
```

## D1 Schema

The `subscriptions` table in `islam-push-db`:

| Column                | Type    | Description                                      |
| --------------------- | ------- | ------------------------------------------------ |
| `endpoint`            | TEXT PK | Push subscription endpoint URL                   |
| `keys_p256dh`         | TEXT    | Client public key for ECDH                       |
| `keys_auth`           | TEXT    | Client auth secret                               |
| `lat`                 | REAL    | User's latitude                                  |
| `lng`                 | REAL    | User's longitude                                 |
| `timezone`            | TEXT    | Client-provided timezone (stored but not trusted) |
| `locale`              | TEXT    | Notification locale (en/id)                      |
| `calc_method`         | TEXT    | Calculation method ID (e.g. singapore)           |
| `notify_fajr`         | INTEGER | Opt-in for Fajr (0 or 1)                         |
| `notify_dhuhr`        | INTEGER | Opt-in for Dhuhr                                 |
| `notify_asr`          | INTEGER | Opt-in for Asr                                   |
| `notify_maghrib`      | INTEGER | Opt-in for Maghrib                               |
| `notify_isha`         | INTEGER | Opt-in for Isha                                  |
| `last_notified_prayer`| TEXT    | Last prayer notified                             |
| `last_notified_date`  | TEXT    | Date (YYYY-MM-DD) of last notification           |
| `created_at`          | TEXT    | Row creation timestamp                           |

## Migrations

| File                                     | Purpose                                      |
| ---------------------------------------- | -------------------------------------------- |
| `migrations/0001_init.sql`               | Create subscriptions table                   |
| `migrations/0002_add_locale.sql`         | Add locale column                            |
| `migrations/0003_add_calc_method.sql`    | Add calc_method column (default MWL)         |
| `migrations/0004_fix_default_calc_method.sql` | Backfill old rows to singapore            |

Apply migrations locally:
```bash
wrangler d1 migrations apply islam-push-db --local
```

## Environment variables

### Plain text (set in `wrangler.toml [vars]`)

| Var                 | Default | Description                                |
| ------------------- | ------- | ------------------------------------------ |
| `VAPID_PUBLIC_KEY`  | *(set)* | VAPID public key for Web Push              |
| `VAPID_SUBJECT`     | *(set)* | `mailto:` URL for VAPID contact            |
| `LOG_LEVEL`         | `debug` | Log level: debug, info, warn, error, none  |
| `PN_BUFFER_SECONDS` | `30`    | Seconds after prayer time to fire PN       |

### Secrets (set via `wrangler secret put`)

| Secret              | Description                              |
| ------------------- | ---------------------------------------- |
| `VAPID_PRIVATE_KEY` | VAPID private key for Web Push           |

## Local development

```bash
# Install dependencies
bun install

# Start dev server
op run -- wrangler dev

# Apply D1 migrations locally
wrangler d1 migrations apply islam-push-db --local

# Run tests
bun run test

# Run tests with coverage
bun run test:coverage

# TypeScript check
bun run typecheck

# Deploy
bun run deploy
```

## CI/CD

| Workflow      | Trigger                    | Action                                    |
| ------------- | -------------------------- | ----------------------------------------- |
| `test.yml`    | PRs and pushes             | Run tests + lint                          |
| `deploy.yml`  | Push to `main`             | Migrations → deploy to Cloudflare         |

Deployments run on every push to `main`. The cron trigger (`* * * * *`) fires every minute.
