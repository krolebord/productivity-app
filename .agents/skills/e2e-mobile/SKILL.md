---
name: e2e-mobile
description: Run the local dev server and the iOS dev build on the agent simulator for end-to-end checks of the mobile app (sign in, drive the UI, screenshot). Use with the global e2e-verification skill.
---

# Mobile e2e (iOS simulator)

Project-specific facts; general agent-device usage is in the global `e2e-verification` skill.

## Server

- `pnpm db:local:migrate`, then `DEV_REMOTE_BINDINGS=0 pnpm dev` (port 3301). `=0` keeps email
  in Miniflare, so no real mail is sent.
- Sign in with any address (e.g. `e2e@example.com`); `pnpm e2e:code` prints the latest codes.

## App

- Build + install the dev variant (no rebuild needed for JS-only changes):
  `APP_VARIANT=development npx expo run:ios --device <agent sim UDID> --no-bundler` in `apps/mobile`.
- Native dependency or `op-sqlite` flag changed: `pod install` in `apps/mobile/ios` first.
- Metro on 8082 (8081 belongs to another project):
  `APP_VARIANT=development EXPO_PUBLIC_API_URL=http://localhost:3301 npx expo start --dev-client --localhost --port 8082`.
- Metro listens on IPv6 only: use `--metro-host localhost`, not `127.0.0.1`.
- Launch without the dev-menu onboarding sheet and floating gear:
  `xcrun simctl openurl <udid> "exp+productivity://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082&__expo_disable_fab=1&__expo_disable_onboarding=1"`
- Bundle id: `com.krolebord.productivity.dev`.

## UI quirks

- Tap an input before typing; `fill` on an unfocused field fails.
- Submit with `agent-device keyboard return`; a typed `\n` is inserted literally.

## Cleanup

Stop Metro and the dev server, `agent-device close`, `simslim shutdown <udid>`.
