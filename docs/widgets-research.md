# Home-screen widgets: research spike

> Historical record of the spike that chose the approach. The spike code it mentions was not merged;
> the shipped widgets are described in [widgets.md](widgets.md).

Research done before building widgets into the app, on branch `spike/android-widget`
(worktree `~/.t3/worktrees/productivity-app/widget-spike`, uncommitted). Everything below was run
on a slim Android 16 x86_64 emulator (release APK) and on the "Agent iPhone (slim)" iOS 27
simulator (Debug and Release simulator builds). Timings come from those environments: a real
phone should be faster, but the proportions should hold. Anything that needs a real device is
listed at the end.

Screenshots referenced below are in [`docs/widgets-research/`](widgets-research/).

## Decisions

| | Android | iOS |
|---|---|---|
| Library | `react-native-android-widget` 0.26.0 (patched) | `expo-widgets` 58.0.27 + `@expo/ui` |
| Layout code | RN-style JSX rendered to RemoteViews by a headless JS handler in the app's own JS runtime | `'widget'` functions serialized at build time and run in the extension's own JS runtime (JavaScriptCore) |
| Layouts over the air | Yes (the handler is app JS) | Yes (`createWidget` stores the layout string in App Group defaults, which the extension prefers over the build-time registry) |
| Data | Snapshot file `widgets/<name>.json` + `requestWidgetUpdate` | `updateSnapshot` / `updateTimeline` (App Group defaults) |
| Taps | `clickAction: "OPEN_URI"` per view | `widgetURL` (whole widget) and `Link` (per row, medium/large only) |
| Background refresh | expo-background-task (WorkManager), needs a timers fix (below) | expo-background-task (BGTaskScheduler); untestable on the simulator |

Shared rules, both platforms:

- **Widgets never read SQLite.** The app builds a display-ready snapshot (`SpikeSnapshot` in
  `apps/mobile/src/widgets/snapshot.ts`: state, links, notes, tasks, writtenAt/By) with a pure
  builder and publishes it. In prod the builder goes to `packages/core` and is shared by the UI,
  the background job and the Android widget handler (which acts as "the app" when its Sync
  button runs).
- **Publish points:** after the user DB opens *and sync settles* (see gotchas: publishing on open
  showed `empty` on iOS), when the app goes to the background, after the background job, and
  from mutations that change what a widget shows.
- **Display-only, deep links for everything.** All taps open `productivity[-dev]:///…`:
  `/`, `notes`, `finances`, `note/<id>`, `task/<id>`, `note/new`, `task/new`. The last two don't
  exist as routes; `src/app/+native-intent.tsx` rewrites them to a fresh draft id (a widget can't
  mint an id per tap, its links are fixed when drawn). Finances "+" would need `transaction/new`.
- **States:** `ok`, `empty`, `signedOut`, plus "stale" (writtenAt older than 6 h) shown in the
  footer. Version the snapshot (`v: 1`) and make every layout tolerate missing fields: an OTA
  layout can meet props written by older JS, and on iOS the props can be `undefined` (below).
- **v1 kinds/sizes:** Today (iOS systemLarge; Android 4×4, min 4×3), Notes (iOS systemSmall +
  systemLarge; Android 2×2 → 4×4), Finances (iOS systemSmall + systemMedium; Android 2×2 → 4×2).

## What was verified, and how

### Android (release APK, emulator)

Method: logcat `-v monotonic` against the touch event's own timestamp (`dumpsys input`), screen
recordings + ffmpeg for pixels, `kill -9` under `adb root` to simulate the low-memory killer
(swipe-away and `am kill` don't kill a process the launcher keeps bound).

| Check | Result |
|---|---|
| Same runtime | The widget handler runs in the app's JS runtime when the process is alive, and Android boots the bundle headless when it isn't. One runtime per process. |
| Tap → redraw, warm | 130–270 ms (delivery/scheduling 120–250 ms, read + draw ~10 ms) |
| Tap → redraw, cold | 1.1–1.4 s (process start 0.7–1.0 s, JS 0.25–0.35 s) |
| Draw → pixels | 50–150 ms |
| Redraw from the snapshot file, process dead | 555–595 ms after `APPWIDGET_UPDATE`; no fd on the user DB, UI never mounts; headless process ~83 MB PSS |
| Resize | One `WIDGET_RESIZED` per cell step; 40–90 ms redraw (≈720 ms via JobScheduler). Layout switches work (Notes list → cards at ≥250 dp, Finances compact → wide). |
| A1 release dev-launcher | No crash: a headless start followed by a launcher open attached the UI to the same runtime (the crash is dev-client only). |
| A2 deep links | All work in release, including `note/new` / `task/new` via the native-intent rewrite. Android redacts URIs in logs, so log in JS. |
| A3 background task | Works **with the timers fix**: forced job with the process dead → process +35 ms, worker +0.37 s, JS loaded +0.79 s, task start +1.76 s, done +3.6 s (open 69 ms, sync incl. a fixed 1.5 s settle 1.73 s, build 2 ms, publish 31 ms); WorkManager SUCCESS and re-enqueue at 15 min; widgets show "background task". No WorkManager conflict (below). |
| A4 four kinds updated at once, cold | With the patch: 3/3 runs rendered all four in 630–800 ms, zero "CatalystInstance not available"; the package-update burst also rendered all four. |
| A5 OTA fingerprint | Editing widget layouts / snapshot code: fingerprint unchanged on both platforms. Any `app.json` change (an Android-only widget size, an iOS-only family, `ios.configuration`, a plugin) changes **both** fingerprints (baseline android `97fdb420dc53`, ios `c81de30e5766`). |

Launcher sizes on the emulator (4 columns, ~86×106 dp cells): 2×2 = 165×206, 3×3 = 256×317,
4×2 = 346×206, 4×3 = 346×317, 4×4 = 346×428 dp.

### iOS (simulator)

Method: SpringBoard driven by agent-device (`open com.apple.springboard`, long-press → Edit →
Add Widget → search → size page → Add Widget; widget context menu to resize). Timings from the
simulator's unified log (`log stream` for chronod / ExpoWidgetsTarget) against the JS publish
timestamp, same clock. Memory with `footprint -p` on the extension process.

| Check | Result |
|---|---|
| B1 build | expo-widgets builds alongside our plugins, RNS gamma and React Compiler. Extension `com.krolebord.productivity.dev.ExpoWidgetsTarget`, App Group `group.com.krolebord.productivity.dev` on both targets, layout registry with all three kinds. Android: exclude it from autolinking (below). |
| B2 adding widgets | Works through agent-device, **after enabling `com.apple.chronod`** (and `com.apple.linkd` for buttons) on the slim simulator: its profile disables both, so the gallery lists no third-party widgets and buttons do nothing. iOS 27's widget context menu resizes in place (Small/Medium/Large/XL Portrait). |
| B3 publish → redraw | Background publish → chronod reload request +55 ms → extension cold launch +125 ms → Today (large) timeline done +243 ms, Notes +307 ms, Finances +354 ms (~45–65 ms of JS + archiving per kind). |
| B3 large snapshot | 50 items = 9 KB, 1000 items = 182 KB: both publish in <60 ms and render fine (Today done +331 ms, all three +712 ms). App Group plist grew to 546 KB (the full snapshot is stored once per kind). |
| B3 extension memory | `phys_footprint` 32 MB, peak 33 MB (Debug); Release 29 MB / peak 30 MB, **36 MB** with the 1000-item snapshot — see open questions. |
| B4 OTA layout | Changed all three layouts (`L1` → `L2`, new title), relaunched JS from Metro, no rebuild: every widget redrew with the new layout on the next publish. Fresh install before any JS ran: the extension used the **embedded** layout (and crashed on `props.writtenAt`, fixed below). |
| B5 deep links | Small widget `widgetURL` → `/notes`, `/finances`; large widget whole area → `/`; per-row `Link` → `task/<id>` (editor opened); `+` → `task/new`. All open the app directly, no "Open in" prompt. |
| B6 interactivity | `Button onPress` returning `{...props, tab}` switches the Notes widget's tab (`tab=tasks`). State is **per kind**: stored in the kind's timeline entry in App Group defaults, so every instance of the kind shares it, and the next publish resets it (verified: back to `tab=notes`). Per-instance state = `ios.configuration` (B10). |
| B7 timeline | `updateTimeline` with a second entry 60 s ahead: the widget switched to "timeline NEXT" on time, with the app suspended. |
| B8 background task | Not testable: expo-background-task compiles `supportsBackgroundTasks()` to `false` on the simulator (`getStatusAsync` = Restricted, `registerTaskAsync` throws). The same open → sync → publish code run in-app on iOS: open 96 ms, sync 2.44 s, publish 4 ms. |
| B9 appearance | `PlatformColor("systemBackground"/"secondaryLabel")` follow light/dark; signed-out and empty states render. Screenshots: `ios-light-*`, `ios-dark-*`. |
| B10 configuration | Works (Release build): "Edit Widget", runtime options for a dynamic enum, per-instance values in `env.configuration`. See below. |
| B11 release | Release simulator build, fresh-install placeholder, footprint, EAS notes. See below. |

## Library bugs and patches

1. **react-native-android-widget drops updates during a cold start** (A4). `HeadlessJsTaskWorker.startTask`
   only checks that a React context exists, not that its instance is ready; a worker that runs
   while React boots fails with `Cannot start headless task, CatalystInstance not available`, the
   task never finishes and that widget never redraws. Happens after reboots, package updates, or
   whenever several kinds are published at once from a cold process. Fixed with
   `patches/react-native-android-widget@0.26.0.patch`: start immediately only if
   `hasActiveReactInstance()`, otherwise wait for `onReactContextInitialized` (guarded, and
   re-checked after adding the listener). Worth upstreaming.
2. **expo-background-task on Android runs JS with timers paused** (A3). RN 0.88's
   `JavaTimerManager` starts paused and only runs timers while an Activity is resumed or a
   `HeadlessJsTaskContext` task is active; expo-task-manager runs the task outside one. With the
   app process dead (or alive but backgrounded), `setTimeout`/`setInterval` never fire: the task
   starts, awaits a timer and hangs until WorkManager stops it, and every interrupted run counts
   as an attempt (exponential backoff: after 7 attempts the next run was ~32 min away). Promises,
   fetch and WebSocket events still work, so it looks like a hang in unrelated code.
   Workaround in the spike: a tiny local Expo module, `apps/mobile/modules/widget-keepalive`,
   that starts a JS-registered headless task (`AppRegistry.registerHeadlessTask`) for the
   duration of the job (`withJsTimers(fn)`); verified: the 100 ms probe fires at 103–125 ms and
   the job completes. Worth an upstream issue for expo-task-manager; until then keep the module
   (it's ~40 lines and Android-only).
3. **expo-widgets: `props` is `undefined` before the app has published** (B4). On a fresh install
   the gallery preview and first render call the layout with no props; any `props.x` access
   throws. Fix: pass `initialProps` (a static placeholder snapshot) as `createWidget`'s third
   argument (the build captures it into the embedded registry, so it also covers a fresh install)
   and start every layout with `const props = input ?? {}`. In Debug a layout error shows a red
   box; in Release it renders `EmptyView` (a blank widget).
4. **expo-widgets Android module autolinks even with `enableAndroid: false`** and pulls the Glance
   gradle plugin (`io.github.expo.peek.glance-fork`) plus work-runtime-ktx 2.7.1, the #49890
   WorkManager clash. Exclude it: `expo.autolinking.android.exclude: ["expo-widgets", "@expo/ui"]`
   in `apps/mobile/package.json`, and `android: null` on each widget in the plugin config.

WorkManager versions after the exclusion: react-native-android-widget brings `work-runtime`
2.12.0, expo-background-task `work-runtime-ktx` 2.10.5 (an empty shim); Gradle resolves both to
2.12.0 with no duplicate classes. No conflict.

## Gotchas

- **React Compiler breaks react-native-android-widget's renderer** ("Invalid Hook Call"): start
  every Android widget file with `"use no memo"`. The iOS layout file has it too (its functions are
  serialized, the compiler output must not leak into them).
- **iOS layout functions are strings.** A `'widget'` function can't use hooks, imports or
  module-scope values at runtime; only its arguments, plain JS and the @expo/ui components and
  modifiers (globals in the extension). `PlatformColor` works for system colors. Every layout
  needs `containerBackground(…, "widget")`.
- **Android `min*` beats `target*`.** The debug widget asked for 4×2 but `minHeight: 140dp` made it
  3×3. Minimums are dp, not cells: check them against real launchers.
- **Process priority on Android.** After the UI was used, the launcher keeps the app bound through
  the library's image ContentProvider at foreground priority (adj 0); after a headless redraw it
  sits at adj 700. Cold starts are rarer than they look, but `am kill`/swipe-away won't simulate
  them: use `kill -9` (root) or memory pressure.
- **Android: taps anywhere on a widget can cold-start the process** (each click is a broadcast
  into the app). Keep handlers cheap and draw from the snapshot file first.
- **Testing expo-background-task on Android release builds:** `triggerTaskWorkerForTestingAsync`
  is debug-only. Force the job with
  `adb shell cmd jobscheduler run -f -n androidx.work.systemjobscheduler <pkg> <jobId>` (Android
  14+ namespaces jobs). After a `kill -9` the first forced run is dropped (WorkManager's
  ForceStopRunnable reschedules), so run it twice. Reset backoff with the WorkManager DB
  (`no_backup/androidx.work.workdb`, `WorkSpec.run_attempt_count`) on a rooted emulator.
- **expo-updates runs its startup check on headless launches too** (every background job and cold
  widget update in a release build hit the update URL). Probably fine, but worth deciding on
  `checkAutomatically` / error recovery for background launches.
- **iOS budget:** `updateSnapshot` calls `reloadTimelines(ofKind:)` for each kind. Reloads while
  the app is foreground are free; from the background they count against WidgetKit's daily budget.
  Publish once per change (debounced), not per mutation, and only kinds whose content changed.
- **iOS `Link` doesn't work in systemSmall** (whole widget only, `widgetURL`).
- **iOS layouts center their content** unless they fill the width (Finances medium rendered
  centered): give the root a full-width, leading-aligned frame.
- **Publish after sync, not on open.** On a fresh iOS start the "app open" publish ran before the
  first pull and showed `empty`; the background publish a minute later had 19 items.
- **Fast Refresh doesn't re-run `createWidget` reliably** in dev: after editing a layout, reload
  the app (that's also what an OTA update does).
- **App Group storage:** expo-widgets stores the props once per kind. Publish per-kind trimmed
  snapshots (only what each kind draws) instead of one shared blob.
- **Slim simulator** (agent sims): enable `com.apple.chronod` (widgets at all),
  `com.apple.linkd` (buttons) and `com.apple.siriactionsd` (configurable widgets) with
  `xcrun simctl spawn booted launchctl enable system/<label>` and reboot; disable them again after.
  agent-device: enter edit mode by long-pressing an empty spot (2 s), pick sizes with the page
  dots, and change home pages with a slow `gesture pan` (flings don't page).
- **Background-task config:** iOS needs the `expo-background-task` config plugin (adds the
  `processing` background mode and `BGTaskSchedulerPermittedIdentifiers`); without it the build only
  had `fetch` and `registerTaskAsync` would throw `BackgroundTasksNotConfigured` on a device.

## Configurable widgets (B10)

`ios.configuration` on a widget generates a `WidgetConfigurationIntent`: the widget gets "Edit
Widget", and each placed instance keeps its own values, which the layout reads from
`env.configuration`. Parameter types: string, number, boolean, enum; an enum with
`dynamic: true` gets its options at runtime from `widget.setConfigurationParameterEnum(name,
options)` (stored in App Group defaults, read by a generated `DynamicOptionsProvider`). That is
the per-instance answer for things like "which note view / account does this widget show". The
spike adds `source` (dynamic enum: Recent notes / Tasks) and `previews` (boolean) to Notes.

Verified on the Release simulator build: the generated `SpikeNotesConfigurationAppIntent` gives
the widget an "Edit Widget" menu; the "Show" picker lists the options the app pushed at runtime
(Recent notes / Tasks); choosing Tasks re-rendered that instance with
`env.configuration = { source: "tasks", previews: true }` (screenshot
`ios-release-configured-notes.png`). Notes:

- On the slim simulator configurable widgets also need `com.apple.siriactionsd` (the extension
  resolves the intent through `com.apple.siri.VoiceShortcuts.xpc`); without it the timeline fails
  with `CHSErrorDomain 1101` and the widget stays a redacted placeholder. Real devices have it.
- The gallery shows configurable kinds as a redacted skeleton, not the `initialProps` preview.
- Before the user opens the picker, the field shows the raw default value (`recent`), not its
  label: pick defaults whose value reads well, or accept it.
- Adding configuration to an existing kind changes its native code (new intent type): plan
  per-instance settings before the first release rather than adding them later.

## Release builds, EAS and OTA (B11)

**Release simulator build** (`Productivitydev-Release.app`, built on the Mac in 9 min): builds
clean with the widgets, the background-task plugin and the Notes configuration. Extension 9.4 MB
(Debug: 15 MB). Info.plist has `UIBackgroundModes` fetch + processing and
`BGTaskSchedulerPermittedIdentifiers: com.expo.modules.backgroundtask.processing`; the embedded
layout registry carries all three layouts plus `initialProps`.

Fresh install, before the first launch: the app is listed in the gallery and Today's preview
renders the embedded placeholder (`ios-release-fresh-install-gallery-today.png`), confirming the
`initialProps` fix. (The keychain kept the session across the reinstall, so the app opened signed
in: a signed-out first launch must publish the `signedOut` snapshot itself, which the spike only
does from the background job.)

Release extension memory: `phys_footprint` 29 MB (peak 30 MB) with real data; **36 MB peak** with
the 1000-item snapshot.

**EAS device builds** (documented, nothing changed on the Apple account):

- The expo-widgets plugin writes `extra.eas.build.experimental.ios.appExtensions` with the
  extension's target name, bundle id (`<app id>.ExpoWidgetsTarget`) and App Group entitlement, so
  EAS knows to create/sign a second target. EAS needs to register two bundle ids
  (`com.krolebord.productivity.{prod,dev}.ExpoWidgetsTarget`) and the App Groups
  `group.com.krolebord.productivity.{prod,dev}`, enable the App Groups capability on the app and
  extension ids, and generate a provisioning profile per target (EAS does this when it manages
  credentials; with manual credentials both profiles must include the App Group).
- The dev and prod variants get separate extensions and groups automatically (both derive from
  the bundle id), so they can be installed side by side like today.
- Background tasks: the `expo-background-task` plugin adds the `processing` mode and the
  permitted identifier; no extra capability is needed for BGTaskScheduler.

**OTA in release:** an EAS Update with new JS runs `createWidget` at the next launch that loads
it, which rewrites each layout in App Group defaults; the next publish (or `reload()`) redraws with
it. Layout and snapshot-builder changes therefore ship OTA (A5: fingerprint unchanged), while
anything in `app.json` (kinds, families, sizes, configuration) needs a new build. Until the app
runs the new JS, widgets keep the old layout; after a fresh install, before first launch, the
build-time registry is used. Not exercised end to end here (that needs publishing an update to
the production channel).

## Open questions (need a real device)

- **iOS extension memory.** Release on the simulator: 29–30 MB with real data, 36 MB with a
  182 KB snapshot; iOS is commonly reported to kill widget extensions around 30 MB on devices
  (the extension embeds JavaScriptCore + Expo modules). Measure on a device. Plan for per-kind
  trimmed snapshots (a few KB each) regardless.
- **iOS background refresh:** BGTaskScheduler cadence, and whether sync + publish fits in the
  time a `processing` task gets (Android needed ~1.8 s warm-ish, ~3.6 s from a dead process on the
  emulator). Test with `triggerTaskWorkerForTestingAsync` (debug) or Xcode's
  `_simulateLaunchForTaskWithIdentifier`.
- **WidgetKit reload budget** for background publishes on a real device.
- **Android cold-start times on a real phone** (emulator: 1.1–1.4 s tap → redraw) and launcher
  differences (cell sizes, `min*` handling, Samsung/Pixel/other launchers).
- **Android Doze:** how often WorkManager actually runs the 15-minute job on an idle phone.
- **Interactive buttons latency on a device** (simulator: ~1.4 s from tap to the extension, partly
  linkd cold start).
- **Push-driven refresh** (server → data-only push → same job) wasn't part of this spike.

## Spike code (for reference, not for merging as is)

- `apps/mobile/src/widgets/snapshot.ts` — snapshot type, pure builder, deep links, Android file I/O
- `apps/mobile/src/widgets/publish.ts`, `refresh.ts`, `background.ts` — publish to both
  platforms; the open → sync → build → publish job; expo-background-task definition
- `apps/mobile/src/widgets/task-handler.tsx` — Android widgets (four kinds) and their handler
- `apps/mobile/src/widgets/ios-widgets.ios.tsx` — iOS layouts, placeholder, timeline/config hooks
- `apps/mobile/src/widgets/debug.ts` + `widget-debug` in `src/app/+native-intent.tsx` — deep-link
  driven test hooks (states, large payloads, timelines, reloads, background job)
- `apps/mobile/modules/widget-keepalive` — Android timers fix for expo-background-task
- `patches/react-native-android-widget@0.26.0.patch` — cold-start race fix
- `apps/mobile/app.json` / `package.json` — widget plugins and sizes, autolinking exclusion,
  `expo-background-task` plugin; `plugins/spike-cleartext.js` is spike-only (release build → local
  HTTP API) and must not ship
