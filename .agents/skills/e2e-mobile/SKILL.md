---
name: e2e-mobile
description: Use when running end-to-end checks of this project's mobile app. Also use the global e2e-verification skill.
---

# Mobile e2e (iOS simulator, Android emulator)

Follow the global `e2e-verification` skill for tool selection, device interaction and cleanup.
In T3 Code, discover and follow its built-in device guidance before launching the app; use its
device-bound command for all UI work. This skill supplies app setup and test details.
Prefer Agent iPhone for iOS and `pixel_36` for Android. Run one platform at a time on this local
machine: it has 8 GB RAM.

## Server

- `pnpm db:local:migrate`, then `DEV_REMOTE_BINDINGS=0 pnpm dev` (port 3301). `=0` keeps email
  in Miniflare, so no real mail is sent.
- Sign in with any address (e.g. `e2e@example.com`); `pnpm e2e:code` prints the latest codes.
- Metro on 8082 (8081 belongs to another project), in `apps/mobile`:
  `APP_VARIANT=development EXPO_PUBLIC_API_URL=http://localhost:3301 npx expo start --dev-client --localhost --port 8082`.
- Metro listens on IPv6 only: use `--metro-host localhost`, not `127.0.0.1`.
- Bundle id / package: `com.krolebord.productivity.dev`.

## Launch URLs

Open these through the selected device workflow after opening the app. In T3, use its returned
device-bound command rather than direct `simctl openurl` or `adb shell am start` commands.

- Expo dev client on Metro, with onboarding and floating gear disabled:
  `exp+productivity://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082&__expo_disable_fab=1&__expo_disable_onboarding=1`
- App pages use the dev scheme: `productivity-dev:///finances`, `productivity-dev:///assistant`
  (also `/agents`, `/skills`, `/memories`). Today is the default app page; verify the visible page.

## iOS app

- Reuse the installed dev build for JS-only changes. Standalone build + install command:
  `APP_VARIANT=development npx expo run:ios --device <agent sim UDID> --no-bundler` in `apps/mobile`.
  In T3, use build/install-only steps and launch through its device workflow; avoid tooling that
  automatically launches the app outside that workflow.
- Native dependency or `op-sqlite` flag changed: `pod install` in `apps/mobile/ios` first.
- Open the Expo launch URL above, then navigate to the requested page.

## Android app

Local emulator: `pixel_36` / `emulator-5554`; verify the selected target before using native commands.
Standalone agent-device needs `--config ~/.agent-device/android.json` (see the global skill).
In T3, keep its returned command and session arguments instead.

- Build the APK **before** booting the emulator; the two together don't fit in RAM. In `apps/mobile`
  (`android/` is gitignored; skip prebuild if it exists and app config/native deps are unchanged):
  ```bash
  APP_VARIANT=development npx expo prebuild -p android --no-install
  cd android && APP_VARIANT=development ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a \
    --max-workers=2 -Pkotlin.daemon.jvmargs=-Xmx1024m
  ./gradlew --stop      # free the daemon's ~1 GB before booting
  ```
  A first build takes ~12 min; it fetches NDK 27.1, platform 37 and CMake 3.22 itself. Output:
  `android/app/build/outputs/apk/debug/app-debug.apk`. JS-only changes need no rebuild.
- After boot (each boot): install if needed and tunnel Metro and the API to the selected emulator:
  ```bash
  export ANDROID_SERIAL=emulator-5554
  adb install -r android/app/build/outputs/apk/debug/app-debug.apk
  adb reverse tcp:8082 tcp:8082 && adb reverse tcp:3301 tcp:3301
  ```
  Verify both port forwards with `adb reverse --list` before opening the Expo launch URL above
  through the device workflow. A dev-client error connecting to `localhost:8082` can mean the
  Metro forward is missing; check both the forward and the running Metro server before retrying.
  The first bundle takes ~20 s (watch for `Android Bundled` in Metro's output).
- The Expo dev menu still opens over the app on Android; close it with its "Close" button
  (`snapshot -i`, then press that ref).
- Keyboard checks (composer, forms, numeric fields) need Gboard instead of agent-device's invisible
  IME; see "Keyboard on Android" in the global skill. The app is edge-to-edge (targetSdk 36), so
  Android's `adjustResize` doesn't shrink the window. A screen must avoid the keyboard itself
  (`KeyboardAvoidingView behavior="padding"` on both platforms). `automaticallyAdjustKeyboardInsets`
  is iOS-only.

## Test account limits

- More only shows the Assistant for addresses in `ASSISTANT_ALLOWLIST` (`apps/web/.env`); reach its
  screens by deep link. Don't send assistant messages: `.env` holds a real OpenRouter key.
- The Appearance setting (Light/Dark/System) is stored on the device and survives sign-out.

## UI quirks

- Tap an input before typing; `fill` on an unfocused field fails (iOS).
- Submit with `agent-device keyboard return` (no `--settle`); a typed `\n` is inserted literally (iOS).
- The 6-digit code field auto-submits; on Android `fill` then reports an error even though sign-in
  worked — `snapshot -i` and look for the Today/Finances/Notes/More tabs.

## Cleanup

Stop Metro and the API only if started for this task. Close the app and follow the global skill's
device cleanup workflow. When shutdown was requested, verify the device is stopped; do not assume
closing a panel alone shut it down. Preserve pre-existing user servers and device sessions.
