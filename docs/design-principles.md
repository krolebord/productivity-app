# Design principles

Living rules for UI decisions. Keep entries short; update them when a decision changes.

## Mobile transitions

Pick the transition by what the screen is, not by what the nearest file does.

| Screen | iOS | Android | Examples |
|---|---|---|---|
| Going deeper (a page) | default push, swipe back | system default | Transactions, Search, Settings |
| Editing / a layer on top | `presentation: "modal"` (native sheet) | `fade_from_bottom` | task, note, transaction editors |
| A place you stay (long-lived, scrolls, own navigation) | default push, swipe back | `fade_from_bottom` | Assistant |
| Short pick that fits (no scrolling, no typing) | `FormSheet` (native sheet sized to content) | same | period, date and time, lists of ≤10 options |
| Long or searchable pick, filter panel | `PickerScreen` (full-screen, back button) | same | tags, searchable lists (currency, category), filters |
| Short list of actions | `ActionSheet` (custom slide-up) | same | ⋮ menu, "New" |
| Confirmation | native `Alert` | same | Delete? |
| Tabs | instant | instant | Today, Finances, Notes, More |

- Don't open a sheet for something people stay in: its swipe-down closes it while they scroll up.
- The on-screen ‹ always does what Android back and the iOS swipe do. Views of the same page swap in
  place with a short fade, never a push that back would undo: the assistant's chat and its Chats list
  are one page, so back from either leaves the assistant, and the list is a header button, not a level up.
- Editor-type screens use the shared `modal` options in `apps/mobile/src/app/(app)/_layout.tsx`.
- `SheetHeader` buttons: cancel is a ✕ on both platforms; confirm is a filled ✓ on iOS (iOS 26 sheets)
  and text ("Save") on Android (Material full-screen dialog). Pass `doneLabel` even on iOS: it's the
  accessibility label. A custom `cancelLabel` stays text, since it's an action, not a dismissal.
- Exception: forms filled in often and in runs (transactions) put Save (and "Add another") in a bottom bar
  that rides on the keyboard, under the thumb; the header keeps ✕ and the ⋮ menu. Rarely opened forms
  (habit, account, tokens) keep Save in the header. Both editors share `EditorShell` (`components/item-editor.tsx`).
- Pickers and filter panels are controls, not routes: render `FormSheet` or `PickerScreen` (`components/ui/`)
  next to the trigger and drive it with `isOpen`/`visible`, so `value`/`onChange` stay typed props. A route
  can't take a callback and can be deep-linked or restored on its own; keep routes for pages and editors.
  List pickers go through `SelectSheet`/`SelectField`, which pick the presentation by length.
- Never put scrolling content or a text field in a `FormSheet`: a swipe meant for the list closes the sheet,
  and the keyboard hides rows. Anything that scrolls or takes typing is a `PickerScreen`.
- `PickerScreen` children mount only while open: keep the picker's state and queries inside them. Its lists
  set `automaticallyAdjustKeyboardInsets` and pad the bottom by the safe-area inset.
- `FormSheet` handles the experimental sheet's bugs (mounts content only while open, Android drag handle);
  keep those fixes in the wrapper. Its content needs no bottom inset.
- Native Android UI (dialogs, pickers, cursor) takes the app's colors from `apps/mobile/plugins/android-theme.js`; keep it in sync with `src/global.css`.

## Checkboxes

Mobile matches web: the shape says what kind of thing it is.

- **Square** for ticking things off and picking: tasks, simple (done / not done) habits, checklist items
  in notes and tasks, markdown task lists, multi-select rows such as tags. Use `Checkbox`, or
  `CheckboxIndicator` when the whole row takes the press (`apps/mobile/src/components/ui/checkbox.tsx`).
- **Circle** only for habits with a target above one: it fills clockwise as progress is logged and shows
  a check once done (`HabitCheck`; web's counted habit in `today-view.tsx`).
- Single choice is a trailing ✓ (`FormOption`, `SelectSheet` rows), never a checkbox.
- Markdown checkboxes are styled in `components/markdown.tsx` (`taskList`); keep them the same shape.
