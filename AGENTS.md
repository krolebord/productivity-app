# Productivity App

## Project Overview

A personal productivity app (notes, accounts, transactions) deployed at https://productivity.krolebord.com. It's a **local-first** application: each user gets their own synced SQLite database (via [sqlite-sync](docs/sqlite-sync.md)) that lives in the browser and replicates to a per-user Durable Object on Cloudflare Workers.

Auth uses magic links (sent via the Cloudflare Email binding) and Google OAuth (arctic), with sessions stored in a central D1 database.

## App-Specific Docs

- [sqlite-sync docs](docs/sqlite-sync.md) — full docs for the offline-first sync library used for user data
- [Currency API docs](docs/currency-api.md) — Frankfurter API used for exchange rates
- [Google Calendar docs](docs/google-calendar.md) — one-way read-only event → task mirror

## Repository Structure

```
src/server.ts              # Worker entry (serves SPA, API, RPC, user-db sync)
src/main.tsx               # Client entry (TanStack Router)
src/routes/                # File-based routes (_app = authed app, _auth = sign-in flow)
src/components/            # App components + ui/ (shadcn-style Radix components)
src/orpc/                  # oRPC client/router (auth endpoints)
src/api/handlers/          # Plain HTTP handlers (OAuth callbacks)
src/user-db/               # Per-user synced DB: schema/migrations, web worker, Durable Object server, jobs
src/lib/                   # Central D1 access (kysely), auth client, currency, emails, stores, utils
migrations/                # D1 migrations for the central auth database
wrangler.jsonc             # Cloudflare config (D1, Durable Objects, email, assets)
```

## Technology Stack

- **Runtime**: Cloudflare Workers + Durable Objects (UserDbServer), D1 (central auth DB)
- **Frontend**: React 19, TanStack Router/Query/Form, Tailwind v4, Radix UI, zustand
- **Data**: @sqlite-sync (per-user CRDT-synced SQLite), kysely + kysely-d1 (central DB)
- **API**: oRPC (`/rpc/*`), plain handlers (`/api/*`), WebSocket sync (`/user-db/*`)
- **Tooling**: pnpm, Biome (format/lint), tsc (typecheck), Vite + @cloudflare/vite-plugin

## Commands

```bash
pnpm dev                  # Dev server on port 3301
pnpm typecheck            # Type-check (tsc — TypeScript 7, native)
pnpm format               # Format + lint fix with Biome
pnpm build                # Production build
pnpm deploy               # Build + wrangler deploy

pnpm db:local:migrate     # Apply D1 migrations locally
pnpm db:new-migration     # Create a new D1 migration
pnpm generate:types:env   # Regenerate worker-configuration.d.ts (wrangler types)
pnpm sync:models          # Regenerate src/agent/models.gen.ts from OpenRouter
```

Two env vars tune the dev server (read from `.env` or the shell): `DEV_PORT` overrides
the 3301 default, and `DEV_ALLOWED_HOSTS` is a comma-separated host allowlist for
reaching it through a proxy. The `Dev server (Tailnet)` preset in
`.agent-ui/settings.jsonc` uses both to publish dev over Tailscale — HMR needs no extra
port because Vite reconnects to whatever origin served the page.

Note: the central D1 database uses SQL migrations in `migrations/`; the per-user synced database defines its schema/migrations in code at `src/user-db/migrations.ts`.

The assistant model catalog is generated: edit the seed `src/agent/supported-models.ts`,
run `pnpm sync:models` to scrape the rest from OpenRouter into `src/agent/models.gen.ts`

When you add a migration under `migrations/`, hand-update the matching Kysely types in
`src/lib/db-types.ts` in the same change — they are no longer generated. Enum columns are
narrowed to domain unions separately, in `src/lib/db.ts`.
