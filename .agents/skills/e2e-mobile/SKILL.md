---
name: e2e-mobile
description: Use when running end-to-end checks of this project's mobile app on the iOS simulator or Android emulator. Builds on the global rn-e2e-verification skill.
---

# Mobile e2e (iOS simulator, Android emulator)

The agent runs on the Linux T3 server; the iOS simulator and Android emulator run on the Mac
device host. Follow the global `rn-e2e-verification` skill for that setup, device interaction
(T3's `device_open` and the `agent-device` command it returns) and troubleshooting. This skill
adds this app's settings, wrapped in one script:

```bash
S=apps/mobile/scripts/e2e.sh   # from the repo root
```

It runs the global scripts with `APP_VARIANT=development`, Metro on **8082** (8081 belongs to
another project) and the local web API on **3301**. One SSH tunnel forwards both ports to the
Mac's `127.0.0.1`, and `install` adds `adb reverse` for both on Android. Bundle id / package:
`com.krolebord.productivity.dev`.

## Flow

1. **Every turn, first:** `$S up`. It starts what's down and waits until the Mac reaches Metro
   and the API:
   - the API: `pnpm dev` with `DEV_REMOTE_BINDINGS=0` (email stays in Miniflare, no real mail)
     and `VITE_APP_URL=http://localhost:3301`, in tmux `productivity-web` (`tmux -L rn-e2e`);
   - Metro, with `EXPO_PUBLIC_API_URL=http://127.0.0.1:3301`;
   - the tunnel.
   If port 3301 already serves another dev server, `up` reuses it. That server may use remote
   bindings and send real email.
2. `$S build android|ios` (add `--force` to rebuild), in the background. It returns at once
   when the native code is unchanged. Android builds on this server in its own systemd unit
   with a memory cap (see "Android build memory" below). iOS builds on the Mac.
3. **Check what's booted before booting anything:** run `$S devices` and `device_list`. The Mac
   has 8 GB of RAM: keep one device booted. A booted device you didn't open may belong to
   another thread or the user; ask before shutting it down, and don't boot a second one beside it.
4. `device_open` with `pixel_36` (Android) or the Agent iPhone simulator (iOS).
5. `$S install android|ios`. On Android it also forwards 8082 and 3301 and checks them.
6. Open the dev client through the `agent-device` command from `device_open`:
   `open com.krolebord.productivity.dev 'exp+productivity://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082&__expo_disable_fab=1&__expo_disable_onboarding=1' --relaunch`,
   then poll `snapshot -i` until the sign-in screen or the Today tab shows (~20 s for the first
   bundle).

App pages use the dev scheme: `productivity-dev:///finances`, `productivity-dev:///assistant`
(also `/agents`, `/skills`, `/memories`). Today is the default page; verify the visible page.

## Signing in

- Use any address (e.g. `e2e@example.com`). After requesting a code, `pnpm e2e:code <email>`
  prints just that code; `pnpm e2e:code` lists the latest ones. A code is deleted once used,
  so signing in on web and mobile needs a new code each time.
- The 6-digit field auto-submits; on Android `fill` may then report an error even though
  sign-in worked. `snapshot -i` and look for the Today/Finances/Notes/More tabs.
- If the emulator's timezone differs from the account's, a "This device is in a different
  timezone" dialog appears after sign-in. **Keep** leaves the account's timezone alone, so
  Today shows the same day as on the web.
- To fetch the same data on web, sign in at `http://localhost:3301` with the same address.
  The first page load can render blank while Vite optimizes deps; reload.

## Android build memory

An out-of-memory kill in the agent's scope takes down everything the agent started (API,
Metro, tunnel, browser), not just Gradle. The native step runs ~10 clang jobs per CMake task
on this 8-core server, and agent processes share a ~12.5 GB limit. So `$S build android`
runs `build.sh` in the systemd unit `productivity-e2e-build-android` with `MemoryHigh=9G`
(throttle) and `MemoryMax=11G` (kill only the build). Measured on the 16 GB server with the API
and Metro running: a full build peaks at ~8.3 GB (page cache included) and takes ~7 min, leaving
~5 GB for everything else. At `MemoryHigh=6G` it still finishes, ~10% slower. Override with `E2E_BUILD_MEMORY_HIGH` /
`E2E_BUILD_MEMORY_MAX`. Stopping the unit also stops the Gradle daemon, so no daemon lingers.
Watch it with `systemctl --user status productivity-e2e-build-android` and
`/tmp/rn-e2e/gradle-productivity.log`. 

## Android app

- The Expo dev menu can open over the app; close it with its "Close" button (`snapshot -i`).
- Keyboard checks (composer, forms, numeric fields) need Gboard instead of agent-device's invisible
  IME; see "Keyboard on Android" in the global skill. The app is edge-to-edge (targetSdk 36), so
  Android's `adjustResize` doesn't shrink the window. A screen must avoid the keyboard itself
  (`KeyboardAvoidingView behavior="padding"` on both platforms). `automaticallyAdjustKeyboardInsets`
  is iOS-only.
- Refs can go stale between snapshots ("needs a complete snapshot"): take a fresh `snapshot -i`
  or press by selector (`press 'label="Continue"'`).

## iOS app

- JS-only changes need no rebuild. Native dependency, config plugin or `op-sqlite` flag changes
  need `$S build ios`; it notices them through the Expo fingerprint.

## Test account limits

- The Assistant (floating button, More, "Ask assistant" actions) only shows for addresses in
  `ASSISTANT_ALLOWLIST` (`apps/web/.env`, read when the API starts; the app picks it up on relaunch).
  On this machine `e2e@example.com` is on it. `.env` holds a real OpenRouter key, so every message
  is billed: send only what the check needs, and prefer a cheap model.
- The Appearance setting (Light/Dark/System) is stored on the device and survives sign-out.

## UI quirks (iOS)

- Tap an input before typing; `fill` on an unfocused field fails.
- Submit with `agent-device keyboard return` (no `--settle`); a typed `\n` is inserted literally.

## Cleanup

- `device_close` with `shutdown: true` for the device you opened, and only that one.
- `$S down` stops the API, Metro and the tunnel when the user is done testing. Other threads may
  share Metro and the tunnel; leave them running if the user wants to keep testing.
- If the Mac refuses SSH (`kex_exchange_identification: Connection reset`) while Tailscale shows
  it online, sshd on the Mac is the problem, not the scripts; ask the user to check it.
