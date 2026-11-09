# Productivity App

## Project Overview

A personal productivity app (notes, accounts, transactions) deployed at https://productivity.krolebord.com. It's a **local-first** application: each user gets their own synced SQLite database (via [sqlite-sync](docs/sqlite-sync.md)) that lives in the browser and replicates to a per-user Durable Object on Cloudflare Workers.

Auth uses magic links (sent via the Cloudflare Email binding) and Google OAuth (arctic), with sessions stored in a central D1 database.

## App-Specific Docs

- [sqlite-sync docs](docs/sqlite-sync.md) — full docs for the offline-first sync library used for user data
- [Currency API docs](docs/currency-api.md) — Frankfurter API used for exchange rates
- [Google Calendar docs](docs/google-calendar.md) — one-way read-only event → task mirror
- [Home-screen widgets](docs/widgets.md) — how the Notes, Today and Finances widgets get their data, and the platform gotchas
- [Design principles](docs/design-principles.md) — UI rules to follow (e.g. which mobile transition each kind of screen uses); read before adding screens

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
  src/components/          # App components + ui/ (primitives mirroring apps/web's ui/: Input, Button, form rows…)
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
in `apps/mobile/src/lib/user-db.tsx` and uses core's `data/*` hooks like the web does. Notes for mobile:

- Markdown (notes, task details, assistant replies) renders natively through
  react-native-enriched-markdown in `apps/mobile/src/components/markdown.tsx`; notes show it by
  default and edit the raw markdown behind an Edit toggle, and checkbox taps rewrite the source
  line with core's `setMarkdownTaskChecked`. It requires the New Architecture. Its code
  highlighting, LaTeX and video assets are opted out under `enriched-markdown` in both
  package.jsons (the root one stops the download, which pnpm skips anyway as an ignored build
  script; the app one is read at `pod install`), so `katex` isn't needed.
- Charts use victory-native (Skia + Reanimated + Gesture Handler) where the web uses recharts;
  the finance overview charts live in `apps/mobile/src/components/overview-charts.tsx`.
  victory-native 43+ imports Skia from the renamed `react-native-skia` package (2.15+), not the
  `@shopify/react-native-skia` that Expo SDK 58 still pins, so `expo install` won't manage it.
- op-sqlite is a native module, so Expo Go can't run the app: it needs a development
  build (`expo-dev-client`). Build one with EAS from `apps/mobile`
  (`eas build --profile development --platform android`, profiles in `eas.json`) and install
  the APK. It opens `defaultLaunchURL` from `app.json` — the Metro served by the
  `Mobile dev client (Tailnet)` preset, which points the app at `Dev server (Tailnet)`. The
  bytecode-vtab SQLite flag sqlite-sync requires is set under `op-sqlite` in both
  `apps/mobile/package.json` (read by Android's Gradle) and the root `package.json` (read by
  the iOS podspec, which walks up from pnpm's real path in `node_modules/.pnpm`); keep them in
  sync. Changing it (or any native dependency) needs `pod install` and a new build.
- `app.config.ts` turns `APP_VARIANT=development` (set by the `development` EAS profile and
  the dev-client preset) into a separate app: "Productivity (dev)",
  `com.krolebord.productivity.dev`, scheme `productivity-dev`, installable next to prod
  (`com.krolebord.productivity.prod`).
- Release builds take JS-only changes over the air with expo-updates (EAS Update): `pnpm update:mobile`
  publishes to the single `production` channel that the `preview` and `production` EAS profiles use (and
  `app.config.ts` names for release builds made outside EAS). `runtimeVersion` uses the fingerprint policy,
  so an update only reaches builds with the same native code; a new native dependency, config plugin or
  app config change needs a new build. The script drops `APP_VARIANT` and `EXPO_PUBLIC_API_URL`, which
  the dev preset sets, so an update can't point release builds at the dev server or miss their fingerprint.
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
- Uniwind applies every conflicting class instead of letting the later one win, so components
  that accept a `className` merge it with `cn` from `src/lib/utils.ts` (tailwind-merge), as on web.
- Assistant attachments go through the contract's `files` input like on web: `lib/assistant-uploads.ts`
  wraps a picked file in a Blob-shaped object that oRPC and Expo's fetch accept (RN's `Blob` can't be
  built from a file). The slim agent simulator can't list photos or Files, so the pickers open empty there.
- Use `Input` from `components/ui/input.tsx`, not a bare `TextInput`: it drops the line height
  on single-line fields, which iOS otherwise renders off-center. Likewise `Switch` from
  `components/ui/switch.tsx`, which sets theme colors (Android otherwise paints the thumb teal).
  Biome enforces both outside `components/ui/` (`noRestrictedImports` in `biome.json`).
- Keyboard handling uses react-native-keyboard-controller (`KeyboardProvider` in `src/app/_layout.tsx`,
  a native module). The editors' `EditorShell` uses its `KeyboardAvoidingView` with `automaticOffset`:
  RN's own one measures itself relative to its parent, so inside an iOS sheet it padded too little and
  the bottom bar ended up behind the keyboard. Prefer the library's components for new keyboard work;
  older screens still use RN's `KeyboardAvoidingView` / `automaticallyAdjustKeyboardInsets`.
- `babel.config.js` adds one local plugin (`babel/hermes-async-arrow-rest-pattern.js`): Hermes in RN
  0.88.1 can't parse `async (...[a, b]) =>`, which oRPC's client ships, and babel-preset-expo 58.0.24
  dropped its own fix. Its comment says how to check whether it can be deleted.
- Short pickers open in `FormSheet` from `components/ui/form-sheet.tsx` (long ones in `PickerScreen`), a wrapper around
  react-native-screens' experimental `FormSheet` (Biome blocks importing it directly). It's experimental API:
  recheck the pickers on both platforms when react-native-screens changes. Android always compiles it; iOS
  only with `RNS_GAMMA_ENABLED=1` at `pod install`, which `plugins/rns-gamma.js` writes into the Podfile, so
  an iOS build made before that plugin shows nothing when a sheet opens. See docs/design-principles.md.
- Wrappers in `components/ui/` stay thin: same props as the native component, `className` merged
  with `cn`, only defaults and platform fixes. They set styles explicitly rather than relying on
  defaults, because React Native reuses native views across screens and an unset style keeps the
  previous view's value (the sign-in code field's letter spacing once leaked into the Today input).

### Home-screen widgets

Notes, Today and Finances widgets on Android (`react-native-android-widget`) and iOS (`expo-widgets` +
`@expo/ui`). Full write-up in [docs/widgets.md](docs/widgets.md); the rules that bite:

- **Widgets never read SQLite.** Core builds small, versioned (`v: 1`) display-ready snapshots per kind
  (`packages/core/src/widgets/`: pure builders + the queries they read, tested in `widgets.test.ts`);
  the app publishes them (`apps/mobile/src/widgets/refresh.ts`) after the first sync settles, on
  (debounced) changes to exactly the queries a snapshot was read from, at midnight, on foreground and
  background (`session.ts`), and the signed-out state on sign-out. Only kinds whose content hash changed
  are published (iOS reload budget, extension memory). `refreshWidgets(db)` is the entry a future
  background job would call.
- **Platform files:** `ios-widgets.ios.tsx` is the only importer of `expo-widgets`/`@expo/ui`, and
  `android-widgets.android.tsx` + `widgets/android/` the only importers of `react-native-android-widget`
  (Biome `noRestrictedImports`; each has a no-op default file). `expo.autolinking.android.exclude` keeps
  expo-widgets' Android module (Glance, an old WorkManager) out of the Android build.
- **Entry:** `apps/mobile/index.ts` (`main`) registers the Android task handler and runs `createWidget`
  on every launch, headless Android ones included. Keep both there.
- Every widget layout/handler file starts with `"use no memo"`: React Compiler breaks the Android
  renderer, and iOS layouts are serialized into the extension. iOS layout functions can't use imports or
  module values, so they inline their palette and helpers.
- **Over the air vs. native:** layouts, builders and snapshot changes ship over the air. Anything in
  `app.json` (a widget, a name, sizes, iOS families, `updatePeriodMillis`) changes the fingerprint on
  both platforms and needs a new build. Widget names in `widgets/kinds.ts` are native names too.
- `patches/react-native-android-widget@0.26.0.patch` fixes dropped updates during a cold start.
- iOS widget props live in UserDefaults, which can't hold `null`: the iOS publisher strips nulls, and
  `initialProps` placeholders must not contain any.
- Deep links `today`, `note/new`, `task/new` aren't routes: `+native-intent.tsx` rewrites them.

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
pnpm e2e:code [email]     # Latest sign-in codes from the local D1 (just the code with an email)
pnpm generate:types:env   # Regenerate worker-configuration.d.ts (wrangler types)
pnpm sync:models          # Regenerate packages/core/src/agent/models.gen.ts from OpenRouter
```

Three env vars tune the dev server (read from `apps/web/.env` or the shell): `DEV_PORT` overrides
the 3301 default, and `DEV_ALLOWED_HOSTS` is a comma-separated host allowlist for
reaching it through a proxy. The `Dev server (Tailnet)` preset in
`.agent-ui/settings.jsonc` uses both to publish dev over Tailscale — HMR needs no extra
port because Vite reconnects to whatever origin served the page. `DEV_REMOTE_BINDINGS=0`
keeps the email binding local (Miniflare) instead of using the remote one, which needs `wrangler login`.

For mobile e2e on the iOS simulator or Android emulator, use the `e2e-mobile` skill (`.agents/skills/e2e-mobile`)
and its wrapper `apps/mobile/scripts/e2e.sh` (`up`, `build`, `devices`, `install`, `down`).

Note: the central D1 database uses SQL migrations in `apps/web/migrations/`; the per-user synced database defines its schema/migrations in code at `packages/core/src/user-db/migrations.ts`.

The assistant model catalog is generated: edit the seed `packages/core/src/agent/supported-models.ts`,
run `pnpm sync:models` to scrape the rest from OpenRouter into `packages/core/src/agent/models.gen.ts`

When you add a migration under `apps/web/migrations/`, hand-update the matching Kysely types in
`apps/web/src/lib/db-types.ts` in the same change — they are no longer generated. Enum columns are
narrowed to domain unions separately, in `apps/web/src/lib/db.ts`.
