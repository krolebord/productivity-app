# Productivity App

## Project Overview

A personal productivity app (notes, accounts, transactions) deployed at https://productivity.krolebord.com. It's a **local-first** application: each user gets their own synced SQLite database (via [sqlite-sync](docs/sqlite-sync.md)) that lives in the browser and replicates to a per-user Durable Object on Cloudflare Workers.

Auth uses magic links (sent via the Cloudflare Email binding) and Google OAuth (arctic), with sessions stored in a central D1 database.

## App-Specific Docs

- [sqlite-sync docs](docs/sqlite-sync.md) — full docs for the offline-first sync library used for user data
- [Currency API docs](docs/currency-api.md) — Frankfurter API used for exchange rates
- [Google Calendar docs](docs/google-calendar.md) — one-way read-only event → task mirror

## Repository Structure

pnpm workspace with three packages; root scripts forward to them (`pnpm --filter`).

```
apps/web/                  # @productivity/web — the deployed Worker + SPA
  src/server.ts            # Worker entry (serves SPA, API, RPC, user-db sync)
  src/main.tsx             # Client entry (TanStack Router)
  src/routes/              # File-based routes (_app = authed app, _auth = sign-in flow)
  src/components/          # App components + ui/ (shadcn-style Base UI components)
  src/orpc/                # oRPC client/router (auth endpoints)
  src/api/handlers/        # Plain HTTP handlers (OAuth callbacks)
  src/mcp/                 # MCP server at /mcp (personal access tokens, user-db tools)
  src/agent/               # Assistant Durable Object (AI agent)
  src/user-db/             # Web Worker bootstrap, Durable Object server, jobs
  src/lib/                 # Central D1 access (kysely), auth, emails, web-only stores and hooks
  migrations/              # D1 migrations for the central auth database
  wrangler.jsonc           # Cloudflare config (D1, Durable Objects, email, assets)
apps/mobile/               # @productivity/mobile — Expo (SDK 58) + Expo Router + Uniwind
  src/app/                 # File-based routes (Expo Router)
  src/global.css           # Uniwind entry: Tailwind v4 + light/dark tokens mirrored from apps/web styles.css
  src/lib/                 # API client (oRPC over the shared contract) and session storage
  app.json                 # Expo config (scheme, bundle ids, icons, splash)
packages/core/             # @productivity/core — platform-agnostic code shared by web and mobile
  src/user-db/             # Synced DB schema/migrations + typed DB hooks (db-context.ts)
  src/data/                # Query hooks and mutations per domain, used by the UI
  src/api/                 # oRPC contract for procedures shared with mobile
  src/agent/               # Assistant model catalog and shared specs
  src/*                    # Domain logic: agenda, transactions, finance, currency, tags, time zones…
```

`packages/core` must stay runnable on React Native: it typechecks without DOM types, and
must not import web-only libraries, `import.meta.env`, or anything from `apps/web`. Import
it from the web app as `@productivity/core/<path>`; inside core, use relative imports.
UI components read and write the user DB through `@productivity/core/data/*` rather than
writing Kysely queries inline.

The mobile app opens the same synced user DB through `@sqlite-sync/react-native` (op-sqlite)
in `apps/mobile/src/lib/user-db.tsx` and uses core's `data/*` hooks like the web does; it has
no charts or markdown rendering yet (notes are edited as plain text). Notes for mobile:

- op-sqlite is a native module, so Expo Go can't run the app: it needs a development
  build (`expo-dev-client`). Build one with EAS from `apps/mobile`
  (`eas build --profile development --platform android`, profiles in `eas.json`) and install
  the APK. It opens `defaultLaunchURL` from `app.json` — the Metro served by the
  `Mobile dev client (Tailnet)` preset, which points the app at `Dev server (Tailnet)`. The
  bytecode-vtab SQLite flag sqlite-sync requires is set under `op-sqlite` in
  `apps/mobile/package.json`; changing it (or any native dependency) needs a new build.
- `app.config.ts` turns `APP_VARIANT=development` (set by the `development` EAS profile and
  the dev-client preset) into a separate app: "Productivity (dev)",
  `com.krolebord.productivity.dev`, scheme `productivity-dev`, installable next to prod
  (`com.krolebord.productivity.prod`).
- The sync WebSocket authenticates with the same `Authorization: Bearer` session token.
- `metro.config.js` stubs kysely's Node-only `FileMigrationProvider`, whose dynamic
  `import()` Hermes can't compile.
- Mobile signs in with the emailed 6-digit code (`auth.mobile.*` procedures) and gets the
  session back as a token it sends as `Authorization: Bearer`; `getAuthFromHeaders`
  accepts that or the web cookie. The procedures mobile calls are declared as an oRPC
  contract in `packages/core/src/api/contract.ts` and implemented with `implement()` in
  apps/web — add new mobile-facing procedures there so both sides stay typed.
- Set `EXPO_PUBLIC_API_URL` (see `apps/mobile/.env.example`) to point the app at a dev
  server the phone can reach; it defaults to production.

- React and React Native must resolve to exactly one version across the workspace, or
  Metro/Vite bundle two Reacts. `react`/`react-dom` are pinned in the pnpm catalog to the
  version the Expo SDK expects; bump them there (for every package) when upgrading Expo.
- Mobile uses TypeScript 7 like the rest of the repo, so `typescript` is listed in
  `expo.install.exclude` and Expo's "expected ~6.x" warning is intentional.
- `minimumReleaseAge` holds Expo patches back by a week, so `expo install --check` may
  list newer patches; run `pnpm exec expo install --fix` in `apps/mobile` once they age in.
- Tailwind classes are only scanned under `apps/mobile/src`; add `@source` to
  `global.css` if shared UI with classNames ever lives in another package.
- `src/uniwind-types.d.ts` is generated by Metro (theme names) and committed.

## Technology Stack

- **Runtime**: Cloudflare Workers + Durable Objects (UserDbServer), D1 (central auth DB)
- **Frontend**: React 19, TanStack Router/Query/Form, Tailwind v4, Base UI, zustand
- **Mobile**: Expo SDK 58 (React Native 0.88), Expo Router, Uniwind (Tailwind v4 for RN)
- **Data**: @sqlite-sync (per-user CRDT-synced SQLite), kysely + kysely-d1 (central DB)
- **API**: oRPC (`/rpc/*`), plain handlers (`/api/*`), WebSocket sync (`/user-db/*`), MCP (`/mcp`)
- **Tooling**: pnpm, Biome (format/lint), tsc (typecheck), Vite + @cloudflare/vite-plugin

## Commands

```bash
pnpm dev                  # Dev server on port 3301
pnpm dev:mobile           # Expo dev server (Metro) for apps/mobile
pnpm typecheck            # Type-check (tsc — TypeScript 7, native)
pnpm format               # Format + lint fix with Biome
pnpm build                # Production build
pnpm run deploy           # Build + wrangler deploy

pnpm db:local:migrate     # Apply D1 migrations locally
pnpm db:new-migration     # Create a new D1 migration
pnpm generate:types:env   # Regenerate worker-configuration.d.ts (wrangler types)
pnpm sync:models          # Regenerate packages/core/src/agent/models.gen.ts from OpenRouter
```

Two env vars tune the dev server (read from `apps/web/.env` or the shell): `DEV_PORT` overrides
the 3301 default, and `DEV_ALLOWED_HOSTS` is a comma-separated host allowlist for
reaching it through a proxy. The `Dev server (Tailnet)` preset in
`.agent-ui/settings.jsonc` uses both to publish dev over Tailscale — HMR needs no extra
port because Vite reconnects to whatever origin served the page.

Note: the central D1 database uses SQL migrations in `apps/web/migrations/`; the per-user synced database defines its schema/migrations in code at `packages/core/src/user-db/migrations.ts`.

The assistant model catalog is generated: edit the seed `packages/core/src/agent/supported-models.ts`,
run `pnpm sync:models` to scrape the rest from OpenRouter into `packages/core/src/agent/models.gen.ts`

When you add a migration under `apps/web/migrations/`, hand-update the matching Kysely types in
`apps/web/src/lib/db-types.ts` in the same change — they are no longer generated. Enum columns are
narrowed to domain unions separately, in `apps/web/src/lib/db.ts`.
