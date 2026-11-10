# Home-screen widgets

Three widgets on Android and iOS: **Notes**, **Today** and **Finances**. They are display-only: every
tap opens a deep link in the app. The approach was chosen in a research spike; its measurements and
library bugs are in [widgets-research.md](widgets-research.md).

| Kind | iOS families | Android | Shows |
|---|---|---|---|
| Notes | `systemSmall`, `systemLarge` | opens 2×2, resizable to 4×4; titles only below ~250 dp wide, cards with a preview above | the first 10 notes in the Notes tab's manual order (small: 4 titles) |
| Today | `systemLarge` | opens 4×4, minimum 4×3 | date, first 10 unfinished inbox tasks and agenda items (including habits) in Today page order; titles up to two lines, "x of y done" |
| Finances | `systemSmall`, `systemMedium` | opens 2×2, resizes horizontally and vertically down to 2×1 | current net worth in the display currency and Net (income minus expenses) for the saved dashboard period; wide adds income/spending, with top 3 categories when at least 160 dp tall |

**Lists show the whole snapshot** (up to 10 rows), and the widget's size decides how many are visible.
Android puts them in a scrolling `ListWidget`, ending with "View N more" / "+N more" for what the
snapshot left out. iOS can't scroll, and expo-widgets tells a layout only its family, not its size
(native WidgetKit's `displaySize` isn't passed through), so Notes large and Today draw every row, clip
at the bottom edge behind a short fade, and keep a fixed footer that opens the full screen ("View all",
"Open Today"). No layout measures rows against a height.

Every widget has a signed-out state ("Sign in", tap opens the app), an empty state ("No notes yet",
"Nothing planned", "No accounts yet"), and a state for before the app has ever published: the
`initialProps` placeholder on iOS (also the gallery preview), "Open the app" on Android. Today also
has a stale state ("Open the app to refresh your day") for when its snapshot has run out; see "Midnight".

## Architecture

**Widgets never read SQLite.** The app builds small, display-ready snapshots and publishes them; the
widgets only draw.

```
user DB ──queries──▶ core builders ──snapshot per kind──▶ publisher ──▶ Android: widgets/<kind>.json + requestWidgetUpdate
 (packages/core/src/widgets)        (hash: only changed kinds)        └▶ iOS: updateSnapshot / updateTimeline (App Group)
```

### Core: `packages/core/src/widgets/`

- `snapshots.ts`: the versioned snapshot types (`v: 1`), one per kind, plus deep-link paths, the
  signed-out snapshot, `pickTodayWidgetDay` and `widgetSnapshotHash`.
- `notes.ts`, `today.ts`, `finances.ts`: per kind, a reader (`read…Inputs(db, ctx)`) that runs the
  queries and a pure builder (`build…Snapshot(inputs, ctx)`). They reuse the app's domain code:
  `notesListQuery` and `markdownToPreviewText` for notes; `scheduledTasksQuery`, `buildAgendaSections` and
  `taskLabel` and `orderTodaySectionRows` for Today; `createAmountConverter`, `sumNetWorth`, `sumFlowTotals`, `topCategories` and
  `resolveDashboardRange` for Finances. Dates, money and previews are formatted in the snapshot, in the
  app's formats (English, money via `currency/format.ts`), in the device's time zone (what the app's own
  Today and Finances screens use).
- `reader.ts`: wraps the DB so every query a reader runs is recorded; `build.ts` returns the snapshots
  and those queries.
- The queries are plain functions (`data/*.ts`: `notesListQuery`, `scheduledTasksQuery`,
  `accountsQuery`, `flowTotalsByCurrencyQuery`, …) that the React hooks pass to `useDbQuery` too, so the
  widgets and the screens read the same thing. `user-db/queries.ts` compiles one without a DB.
- `widgets.test.ts`: the builders against an in-memory SQLite with a fixed `now` and time zone (New
  York, where late-evening times fall on the next UTC day).

Snapshots are trimmed to what each kind draws (iOS stores each one in App Group defaults, and the
extension runs near its memory limit; see "Memory" below). A Today snapshot is ~2 KB.

Versioning: layouts ship over the air and can meet a snapshot written by another build. Add fields
freely and make layouts tolerate missing ones (`const props = input ?? {}`, `?.`, `??`). Bump `v` only for
a change old layouts would misread; the Android store treats an unknown `v` as "never published".

### Mobile: `apps/mobile/src/widgets/`

| File | Role |
|---|---|
| `kinds.ts` | native widget names (match app.json) and the `WidgetPublisher` interface |
| `refresh.ts` | `refreshWidgets(db)`: build, hash, publish changed kinds (serialized queue); `publishSignedOutWidgets()` |
| `session.ts` | `startWidgetPublishing(db)`: when to refresh (below); started by `UserDbProvider` |
| `ios-widgets.ios.tsx` | iOS layouts, placeholders, `createWidget`, the iOS publisher; `ios-widgets.tsx` is the no-op elsewhere |
| `android-widgets.android.tsx` | Android task handler and publisher; `android-widgets.tsx` is the no-op elsewhere |
| `android/` | Android layouts (`*-widget.tsx`), shared pieces, the snapshot file store |
| `theme.ts` | light/dark palettes from `src/global.css` (the iOS layouts inline the same values) |

`apps/mobile/index.ts` is the app entry (`main` in package.json): it imports `expo-router/entry`,
registers the Android task handler, and imports the iOS module, whose `createWidget` calls store each
layout in App Group defaults. It runs on every launch, including Android's headless ones.

### When the app publishes

- After the user DB opens **and the first sync settles** (online with no events for 1 s, or 10 s at
  most): publishing right on open showed an empty widget in the spike, before the first pull arrived.
- When a query a snapshot was built from changes, debounced by 2 s. `session.ts` subscribes to exactly
  the recorded queries as live queries and reconciles the set after each refresh (their parameters move
  with the day).
- At local midnight while the app runs, when it returns to the foreground (500 ms debounce), and right
  away when it goes to the background.
- On sign-out, and on a launch without a session: the signed-out snapshot for every kind.

Each time, every kind is rebuilt (a handful of small indexed queries) but only kinds whose content
hash changed are published. `writtenAt` is left out of the hash. On iOS, reloads while the app is in
the foreground are free; background ones count against WidgetKit's daily budget.

### Midnight

The Today snapshot carries today and tomorrow (tomorrow's overdue = today's unfinished tasks). iOS
publishes them as a two-entry timeline, the second dated at the next local midnight, so the widget turns
over without the app. Android has no timeline: the handler picks the day for the current time
(`pickTodayWidgetDay`) whenever it draws, and the Today widget sets `updatePeriodMillis` (30 min, the
minimum) so Android redraws it from the file after midnight. Notes and Finances don't depend on the
clock within a day; Finances' selected dashboard period advances when the app next publishes.

**Stale Today.** Nothing refreshes widgets in the background in v1, so a snapshot runs out when
tomorrow ends (`todayWidgetExpiresAt`: the last day's `endsAt`). Past that, a widget would show an old
day under "Today", so it draws "Open the app / to refresh your day" instead; the tap opens Today, and
the foreground refresh republishes. iOS gets it as a third timeline entry at that midnight
(`staleTodayWidgetSnapshot`, `state: "stale"`), so the layout reads the state from its props and doesn't
depend on when WidgetKit renders the entry. Android compares the clock at draw time, on the same
periodic redraw. Notes and Finances have no such state: they show what the app last published,
however old (`writtenAt` is there for a future "updated …" line).

### Deep links

All taps open `productivity:///…` (`productivity-dev:///…` for the dev variant, from
`Constants.expoConfig.scheme`): `notes`, `finances`, `note/<id>`, `task/<id>`, and three that aren't
routes, rewritten in `src/app/+native-intent.tsx`:

- `note/new`, `task/new` → a fresh draft id (a widget's links are fixed when drawn, so it can't mint one per tap);
- `today` → `/`, and it marks the launch so the "default home: Finances" preference doesn't redirect it
  (`lib/launch-link.ts`).

The app stack anchors direct links to `(tabs)`. Cold-started editors therefore have the app beneath
them: both the header close button and Android Back return to the tabs rather than doing nothing or
exiting. Test dismissal after a direct launch, as well as checking that a widget opens its editor.

Android: links are `clickAction: "OPEN_URI"` per view, handled natively (no JS runs on a tap). iOS:
`widgetURL` for the whole widget, `Link` per row on medium/large. **`Link` doesn't work in
`systemSmall`**, so small widgets are one tap target (Notes small has no "+"; when empty, it opens a new note).

## Gotchas

- **`"use no memo"`** at the top of every widget layout/handler file. React Compiler breaks
  react-native-android-widget's renderer ("Invalid Hook Call"), and iOS layout functions are serialized.
- **iOS layouts are strings.** A `'widget'` function runs in the extension's own JS runtime: no hooks,
  imports or module-scope values; only its arguments, plain JS and @expo/ui components/modifiers. The
  extension's `Image` global is React Native's (asset resolution), not SwiftUI's: use `Label` with
  `systemImage` and `labelStyle("iconOnly")` for SF Symbols.
- **iOS `props` is `undefined`** before the app publishes (fresh install, gallery): pass `initialProps`
  (plain literals; the build captures them into the embedded registry) and start with `input ?? {}`.
  In Release an exception renders an empty widget.
- **iOS props can't hold `null`.** expo-widgets stores `initialProps` and timeline props in
  UserDefaults, which rejects `NSNull`; the native call then fails with "Exception in HostFunction".
  The iOS publisher strips nulls (`withoutNulls`), layouts treat a missing field like `null`, and the
  placeholders must not contain any.
- **iOS roots** need `containerBackground(…, "widget")` and a full-width, leading-aligned frame
  (`frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" })`), or content renders centered.
- **iOS clipped lists need `minHeight: 0`.** A SwiftUI frame with only a max never gets smaller than its
  content, so a long list pushes the header and footer out of the widget. iOS also tints the widget
  background (dark mode especially), so never paint over content in the palette's background color:
  the list fades its rows out with a `Mask`.
- **Keep expo-widgets out of Android:** `expo.autolinking.android.exclude: ["expo-widgets", "@expo/ui"]`
  in `apps/mobile/package.json` and `android: null` on each widget in the expo-widgets plugin. Its Android
  module autolinks otherwise and drags in Glance and an old WorkManager.
- **Android `min*` beats `target*`.** Minimums are dp and decide the smallest cell count. Measured on a
  4-column Pixel launcher: 2×2 = 165×206 dp, 3×3 = 256×317, 4×2 = 346×206, 4×3 = 346×317, 4×4 = 346×428.
  Today's `minWidth: 280dp` forces 4 columns and `minHeight: 180dp` allows 3 rows (220dp stayed at 4 on the current Pixel launcher).
- **Cold-start race on Android:** `patches/react-native-android-widget@0.26.0.patch` (root
  `patchedDependencies`) waits for the React instance before starting a widget task; without it,
  updates arriving while React boots are dropped.
- **SDK 58 file writes and moves are async.** Await both the temporary file write and the replacement
  move (with overwrite) before requesting a widget redraw. Otherwise edits can leave a zero-byte
  snapshot or redraw from incomplete data.
- **Android handler stays cheap:** it may run in a headless, cold process (resize, periodic update,
  reboot). It only reads `widgets/<kind>.json`; it never opens the DB.
- **Android text measures its own header.** Native TextViews include font padding and scale with
  system text settings; a fixed-height two-line header clipped Today's date on a physical phone.
- **Finances adapts to height too.** Below 160 dp it uses smaller padding/type and omits categories;
  missing-rate notices take priority over period Net in that short layout. Its 40 dp native
  minimum permits one launcher row; the default remains 2×2. Launcher cell dimensions vary.
- **Fast Refresh doesn't re-run `createWidget`.** After editing an iOS layout, reload the app.
- **Biome** (`noRestrictedImports`) keeps `expo-widgets`/`@expo/ui` in `ios-widgets.ios.tsx` and
  `react-native-android-widget` in the Android files. Biome applies only the last matching override's
  options for a rule, so each override in `biome.json` repeats every restriction its files need.

## Over the air vs. a new build

Ships over the air (EAS Update): layouts, builders, snapshot fields, publish timing. On iOS the next
launch running the new JS rewrites the layouts in App Group defaults; the next publish redraws.

Needs a new native build: anything in `app.json` (adding or renaming a widget, Android sizes or
`updatePeriodMillis`, iOS families or configuration), the patch, a library upgrade. Any of these changes
the fingerprint on **both** platforms. Widget names (`kinds.ts`) are native names: renaming one orphans
placed widgets.

EAS device builds: the expo-widgets plugin declares the extension (`<app id>.ExpoWidgetsTarget`) and the
App Group (`group.<app id>`) for EAS credentials, separately for the dev and prod variants. See
"Release builds, EAS and OTA" in the research doc.

## Memory (iOS)

iOS is reported to kill widget extensions around 30 MB. The spike measured the Release extension at
29–30 MB with real data and 36 MB with a 182 KB snapshot on the simulator. A v1 Release simulator
build with full lists measured 33 MB footprint, 33 MB physical footprint and 36 MB peak, before the
final clipping/mask fix. This exceeds the reported ~30 MB budget; real-device memory verification
and a measurement of the final layout remain required. Keep snapshots small (the row limits in the
builders).

## Testing on the simulator/emulator

- `pnpm --filter @productivity/core test` runs the builder tests.
- Devices: the `e2e-mobile` skill. The slim agent simulator disables `com.apple.chronod`, so the widget
  gallery lists no third-party widgets until you run
  `xcrun simctl spawn booted launchctl enable system/com.apple.chronod` and reboot the simulator (disable
  it again afterwards). In agent-device, enter edit mode by long-pressing an empty spot for 2 s, and page
  with a slow `gesture pan`.
- Dev client: Metro must run with `APP_VARIANT=development`; changing that environment needs a full
  app reload and snapshot republish, or already placed widgets retain the previous scheme.
- Dev client: a cold launch from a widget link stops at the dev launcher (the link is lost);
  release builds open the link directly. Test cold-start links in a Release build.
- Android: long-press the home screen → Widgets → the app; the launcher keeps the app process bound, so
  simulate a cold start with `kill -9` as root, not `am kill`.

## Not in v1

Background refresh (expo-background-task, plus the Android timers workaround from the spike), server
push, per-instance configuration (`ios.configuration`; plan it before release, adding it later changes
the native code), interactive buttons (ticking a task), a "hide amounts" setting, lock-screen and
accessory widgets, a large Finances widget, Android preview images and Glance. `refreshWidgets(db)` is
the entry point a background job would call after opening the DB and syncing.

## Verification status (2026-11-09)

Workspace typecheck, all 369 core tests (35 files), `pnpm format` and `git diff --check` pass.
Biome reports six existing warnings in untouched web files.

Fresh populated iOS checks passed in light and dark after the final `minHeight: 0` and mask fixes:
Notes large and Today large retain their headers/footers and fade overflowing rows without a dark
band. Notes small showed three titles and “11 more”. Finances small and medium matched the local
fixture: $14,460 net worth, +$1,960 this month (small rounds to +$2K), $3,000 income, $1,040 spending,
and Rent/Groceries/Transport categories. The Today footer opened Today. Evidence in
`/tmp/widgets-v1-screenshots/verify6-ios-{notes,today}-{light,dark}.png`.

A prior run of the current layouts verified light empty states for all five iOS families, a
one-note large widget, Notes plus and note-row links, and refresh after creating a note and
backgrounding. Evidence: `verify5-ios-empty-large.png`, `verify5-ios-one-note.png`. Finances medium
was transiently blank before its empty state appeared. Earlier checks before the list-layout simplification also verified all iOS deep-link paths:
note row, new note, Notes footer, task row, new task, Today footer/header, Notes small and Finances.
They verified checklist edits and task completion refreshing widget content/counts, signed-out states
on all five families, and the background Today timeline switching to tomorrow using a 90-second
stand-in. Existing evidence includes `ios-dark-notes-after-edit.png`,
`ios-dark-signed-out-{notes,today}-page.png`, and `ios-dark-today-rollover-{before,after}.png`.
A prior Release cold-start check verified that a Today link overrides the Finances default home
(`ios-release-cold-start-today-link.png`); it was not repeated in the latest runs.
These checks are prior evidence for unchanged linking/publishing behavior, while the `verify6`
screenshots specifically verify the final clipping/mask layouts. They should not be discarded merely
because the latest run did not repeat them. The replacement Notes large “View all” footer still needs
a tap check on the final layout; the replacement Today footer was checked successfully.

Android checks now have direct evidence in `/tmp/widgets-v1-screenshots/`:

- Today 4×4 populated layout, scrolling, fixed header/footer and “+5 more”: `verify7-android-today-4x4.png`
  and `verify7-android-today-scroll.png`. Footer and new-task links passed after republishing stale
  production-scheme snapshots with the dev client. No scheme-selection source change was needed.
- Notes 2×2 titles and 4×4 previews in light/dark, scrolling, scrolled note-row link, new-note link,
  “View 4 more” opening Notes, and a checklist edit reaching the preview: `final-android-notes-*`,
  `final-android-note-row-link.png`, `final-android-note-edit-update.png`.
- Finances 2×2 in light/dark showed the expected compact net worth/month change and opened Finances:
  `final-android-finances-2x2-dark.png`, `final-android-finance-move.png`.

Resize testing after the checklist edit exposed a real persistence race: `notes.json` was zero bytes
while `notes.json.tmp` held the valid data. SDK 58 `File.write()` and `File.move()` return promises;
the store now awaits both and moves with overwrite without first deleting the old snapshot. A local
fault-injection check passed with delayed writes/moves and rejected writes/moves: the old snapshot
remains readable, publication waits for replacement, and failures propagate to the publisher.
Mobile typecheck and the targeted Biome check pass. Emulator checks after the fix passed: edits,
resizes, sign-out and signing in to another account preserved valid snapshots without leftover
temporary files.

The remaining Android checks subsequently passed:

- Finances 4×2 in light/dark, correct values/categories and tap to Finances:
  `final-android-finances-4x2-{light,dark}.png`.
- Task-row link to the correct editor, completion removes the row and updates the footer to
  “1 of 13 done”: `final-android-today-after-task-complete.png`.
- Signed-out and empty states for all three kinds in both themes:
  `final-android-{signed-out,empty}-{today,notes-finances}-{light,dark}.png`.
- Next-day selection without reopening the app: a temporary builder stand-in put tomorrow 90 seconds
  ahead, and an explicit update broadcast redrew it after that timestamp:
  `final-android-rollover-before.png`, `final-android-rollover-after-redraw.png`. The exact original
  builder was restored and its SHA-256 checked. This verifies day selection on redraw, rather than
  the OS's precise periodic scheduling time.
- Today minimum-size issue fixed: 220dp prevented shrinking below four rows on this Pixel launcher.
  180dp allows 4×3 and still prevents shrinking to two rows. This `app.json` change needs a new native
  build; a Debug APK was rebuilt and installed to verify it. Final populated light/dark evidence:
  `final-android-today-4x3-{light,dark}.png`. Scrolling and exact updated “+4 more” count:
  `final-android-today-more-count.png`; its link opened Today.

Workspace typecheck and Biome pass. All 369 core tests pass with two test workers after the temporary
rollover stand-in was restored. A parallel run during the native build hit timeouts; the bounded run
finished successfully in 14 seconds.

No Release builds or memory measurements were run in these rechecks, as requested. Earlier Release
measurements above predate the final mask fix. No commits, pushes, EAS builds or updates were made.
Both devices are shut down; chronod is disabled. Android was left signed in to the seeded test
account, with system light appearance and normal midnight snapshots restored. Test Metro and tunnel were stopped. The pre-existing API and unrelated Tailnet presets were
left alone.

### Android phone follow-up

A physical-phone report exposed two gaps in the earlier emulator checks: Today's two-line header
clipped the date, and a directly launched editor had no app screen beneath it to return to. The
Android header now measures its text naturally instead of imposing a 36 dp height. The app stack
exports `unstable_settings.anchor: "(tabs)"`, providing a shared destination for header dismissal and
Android Back after direct editor launches.

Finances also now allows vertical resizing down to 2×1 while retaining its 2×2 default. Below 160 dp
it reduces padding/type, omits spending categories, and keeps income/spending only at wide widths.
Placeholder, empty and signed-out states also fit the short layout. This native sizing change
requires a new APK.

Validation: workspace typecheck, Biome (the same six existing web warnings), all 17 widget builder
tests, and a local x86_64 Debug build passed. Device re-verification could not be completed: the Mac
was unreachable; the local emulator booted but showed a System UI ANR, then failed its restart with
KVM access denied. No new widget screenshots were obtained. The date at larger text sizes, one-row
Finances at narrow/wide widths, and header/system Back after cold editor launches still need device
checks. The local emulator was shut down, temporary KVM permissions restored, and owned test services
stopped. No release memory measurements were taken.

The updated Android preview APK was submitted to EAS:
[widget fixes build](https://expo.dev/accounts/krolebord/projects/productivity/builds/c238771b-fc78-41ef-8817-8befe71f8ca0).
It uses the production API, existing release app identity and existing Android credentials. No OTA
update or store submission was made.

### Dashboard and Today consistency

Today includes the unfinished inbox first, then agenda sections in the mobile page's actual display
order, including habits. One ten-item cap applies to the combined list, including overdue items.
Completed items contribute to the completion summary but are not drawn. Habits use a simple repeat
icon and open Today; they do not expose interactive progress controls. Both platform layouts allow
up to two title lines. Android rows measure their content, including system text scaling.

Finances reads the saved rolling-day or custom-cycle dashboard range. Net worth is the current
included-account balance; **Net** beneath it is income minus expenses for that selected period,
matching the finance page. Income, expenses and categories share that range and currency converter.
The old monthly net-worth-change field is not reused as Net when rendering a cached snapshot.

### QoL follow-up verification

The combined Today/Finances and chat pin/badge changes passed workspace typecheck, Biome (three
existing warnings), all 379 core tests across 37 files, and Android/iOS release-mode JavaScript
exports with React Compiler and Hermes. These exports do not verify native widget rendering.
An independent verifier reran the then-current 376 tests and found no confirmed defect in the
reviewed paths. Follow-up regression coverage also checks existing-conversation migration/defaults,
pinning without changing read receipts, dashboard cycle/range edits and counted habit completion.
The final code pass also added the unread badge to desktop Assistant sidebar controls, alongside
the narrow-screen web shortcut and mobile FAB; the web typecheck passed afterward.

Targeted live checks subsequently passed on web, a matching iOS Debug simulator build and a matching
Android Debug emulator build (2026-11-10). The browser blocker was the host's AppArmor restriction on
Chrome's sandbox; the tool-prescribed `t3 browser setup --base-dir /home/agent/.t3` installed the host
permission and browser checks then worked.

- Web: chat menu pin/unpin, Pinned ordering without duplicates, pin persistence after reload,
  preservation of unread state on pinning, per-chat read receipts, desktop/sidebar and narrow-screen
  unread badges. Running chats were excluded; finished and failed unread chats counted. Pin changes
  synced between web, iOS and Android without changing activity/read timestamps.
- iOS: the FAB unread count, chat list and unpin action; Today two-line task/habit titles, section
  order and ten-row cap in light/dark; habit links opening Today and completion removing the row and
  updating the summary. Finances small/medium showed the custom cycle's Net $0 and unchanged $14,460
  net worth; restoring Last 30 days restored Net +$1,960, income $3,000 and spending $1,040.
- Android: old installed data upgraded through migration 28, pins and unread badges matched web,
  and viewing the last unread chat cleared the badge. Today passed at 4×4 and 4×3, including scrolling,
  two-line titles, fixed header/footer and the ten-row cap. Dark mode at 1.35 system font scale kept
  the date and rows readable. Habit links and completion refreshed the widget and its summary.
  Finances passed at 2×1, 4×1, 2×2 and 4×2 in light/dark. One-row widgets omit categories; the narrow
  layout retains the selected period beside Net, while wider layouts put it above income/spending.

These checks found and fixed two defects: a new `change: null` placeholder field crashed iOS
`createWidget` even with a matching binary, and Android's Today footer needed natural height and a
gap beneath the variable-height list. The finance period label was also moved to avoid clipping.
All were rechecked on the affected platform. Android's Expo development client sometimes failed
after headless widget launches/reloads; restarting the client recovered it. Cold release lifecycle
behavior was not retested in this pass.

Fresh screenshots are under `/tmp/widgets-v1-screenshots/qol-*`, including
`qol-web-pins-unread.png`, `qol-ios-today-{light,dark}.png`,
`qol-ios-finances-medium-30days.png`, `qol-android-today-4x3-dark-large-text.png`, and
`qol-android-finances-{2x1-4x1,2x2-4x2}-{light,dark}.png`. The unchanged Notes layouts, signed-out/empty
states and midnight delivery use the prior evidence above; those were not repeated. No release
builds or memory measurements were performed. Temporary task dates and dashboard settings were
restored, this pass's test rows removed, and appearance/text size restored. Devices and owned test
services were stopped; iOS chronod was disabled again.

Conversation pins require user DB migration 28 on the server. Deploy the server before rolling out
clients with the new column. These QoL changes were not deployed or published as an OTA.
