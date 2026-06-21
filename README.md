# islam-push-worker

A Cloudflare Worker that sends prayer time push notifications to registered users of [islam.raharoho.me](https://islam.raharoho.me). It handles push subscription management (registration/unsubscription) via HTTP fetch and delivers timely push notifications for each prayer window via a cron-triggered scheduled handler.

## Architecture

The Worker is built on Cloudflare's Workers platform and uses:

- **Cloudflare Workers** — handles both HTTP fetch requests and scheduled (cron) events.
- **Cloudflare D1** — stores user subscription data and notification state.
- **Web Push Protocol** — delivers encrypted push notifications to subscribed browsers using the VAPID protocol.

### Request handling

| Event      | Trigger                                | Purpose                                      |
| ---------- | -------------------------------------- | -------------------------------------------- |
| `fetch`    | HTTP requests from the islam app       | Register/unregister push subscriptions       |
| `scheduled`| Cron trigger (every minute)            | Check prayer times and send push notifications |

## D1 Schema

The Worker uses a single `subscriptions` table in the `islam-push-db` D1 database:

| Column                | Type    | Description                                      |
| --------------------- | ------- | ------------------------------------------------ |
| `endpoint`            | TEXT PK | Push subscription endpoint URL                   |
| `keys_p256dh`         | TEXT    | Client public key for ECDH key agreement         |
| `keys_auth`           | TEXT    | Client auth secret                               |
| `lat`                 | REAL    | User's latitude (for prayer time calculation)    |
| `lng`                 | REAL    | User's longitude                                 |
| `timezone`            | TEXT    | User's IANA timezone string                      |
| `notify_fajr`         | INTEGER | Opt-in for Fajr notification (0 or 1)            |
| `notify_dhuhr`        | INTEGER | Opt-in for Dhuhr notification                    |
| `notify_asr`          | INTEGER | Opt-in for Asr notification                      |
| `notify_maghrib`      | INTEGER | Opt-in for Maghrib notification                  |
| `notify_isha`         | INTEGER | Opt-in for Isha notification                     |
| `last_notified_prayer`| TEXT    | Last prayer name a notification was sent for     |
| `last_notified_date`  | TEXT    | Date (YYYY-MM-DD) of the last notification       |

## Local Development

Prerequisites: [Bun](https://bun.sh), [Wrangler](https://developers.cloudflare.com/workers/wrangler/), and [1Password CLI](https://developer.1password.com/docs/cli/) (for secrets).

```bash
# Install dependencies
bun install

# Start the dev server (uses 1Password to inject secrets)
op run -- wrangler dev

# Apply D1 migrations to the local database
wrangler d1 migrations apply islam-push-db --local
```

## Secrets

The following secret must be set in the Cloudflare Worker environment:

| Secret            | Description                        |
| ----------------- | ---------------------------------- |
| `VAPID_PRIVATE_KEY` | VAPID private key for Web Push   |

Set it via Wrangler:

```bash
wrangler secret put VAPID_PRIVATE_KEY
```

The corresponding `VAPID_PUBLIC_KEY` is also used by the islam app frontend and should be set in that environment. Its value is:

```
BO52m2RzNMPmB1E8ZeShL6uDgtx8qjSHjwkW7nt5AP2kqPUhilePDf_Vki89XUB3nqQ63jv7qBYaLqkgcDWi-DY
```

## Testing

```bash
# Run tests
bun run test

# Run tests with coverage
bun run test:coverage
```

## CI/CD

Two GitHub Actions workflows are configured:

| Workflow    | Trigger                    | Purpose                                      |
| ----------- | -------------------------- | -------------------------------------------- |
| `test.yml`  | Pull requests and pushes   | Run tests and linting on every change        |
| `deploy.yml`| Push to `main` branch      | Deploy the Worker to Cloudflare              |

Deployments happen automatically when code is merged or pushed to `main`.
