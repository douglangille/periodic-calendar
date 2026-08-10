# Calendar Plus — conventions for agents

General Obsidian plugin knowledge (API patterns, the `eslint-plugin-obsidianmd`
rules, CSS/theme rules, submission requirements, the CLI dev loop) lives in the
`obsidian-plugin-dev` skill. **Read that skill first.** This file covers only what
is specific to this project. The rule count is deliberately not written down here:
it changes with every plugin release (0.4.0 ships 41), and a number in prose is a
number that goes stale silently.

## What this plugin is

A calendar for periodic notes, extensible by other plugins. It is a
reimplementation of Liam Cain's Calendar plugin (MIT, unmaintained since 2024),
written from scratch in plain TypeScript.

Two goals, in order:

1. **Parity.** Anything the original does, this does — same interactions, same
   feel. A user switching over should not miss anything.
2. **Extensibility.** Other plugins contribute per-cell information through a
   public API instead of us hardcoding every feature.

Deliberate non-goals:

- **No Svelte, no Rollup, no framework.** Plain TS with `createEl`, which is the
  idiomatic Obsidian approach and the reason this rewrite exists.
- **No `obsidian-calendar-ui` or `obsidian-daily-notes-interface`.** Both are
  unmaintained. Periodic note configuration is read directly from core Daily
  notes and the Periodic Notes plugin's data.
- **Zero runtime dependencies.**

## Environment

- Package manager: **pnpm**. Never `npm install` or `yarn`.
- `pnpm dev` watches and rebuilds. The reload happens inside Obsidian, via the
  **Hot Reload** plugin watching `main.js` — the build never calls the Obsidian
  CLI, because those calls steal window focus (see Verification).
- The repo is symlinked into the test vault at
  `~/dev/my-obsidian-plugins/.obsidian/plugins/calendar-plus`.
- The **original `calendar` plugin is installed in the test vault on purpose**, as
  the reference for parity. Open both side by side and compare.
- **Never develop against the real vault** (`DiarioZK`).

## Architecture

```
src/
  main.ts            # lifecycle only
  api/
    types.ts         # THE PUBLIC CONTRACT — see below
    calendar-api.ts  # implementation of the source registry and events
  calendar/          # the view and its rendering, plain TS
  domain/            # pure logic: imports nothing, unit-tested (see below)
  i18n/              # en/es dictionaries and t() — every visible string
  periodic/          # config reading, date ⇄ file resolution, creation
  sources/           # built-in sources, written against the public API
  settings.ts
```

### `api/types.ts` is a contract, not an implementation detail

It is copied verbatim by consumer plugins. Therefore:

- **Do not change its shape without bumping `CalendarPlusApi.version`.** Adding
  an optional field is fine; renaming or removing anything is not.
- Keep it free of imports from the rest of `src/`. Only `obsidian` types.
- Every exported member needs a doc comment. This file is the documentation.
- **`Moment` is declared there, once.** A consumer implementing `CalendarSource`
  by hand needs the type, so it is exported from the contract;
  `periodic/resolve.ts` re-exports it (`export type { Moment } from
  '../api/types'`) and the rest of the plugin keeps importing it from there.
  Never re-derive `ReturnType<typeof window.moment>` a second time — the point of
  exporting it was to delete that duplication, not to add one.

### Sources are called on every render

`getMetadata` runs once per visible cell, per source, on every repaint. It must
read from memory. If a built-in source needs vault data, it maintains its own
cached index and calls `refresh(id)` when that index changes — it does not read
files inside `getMetadata`.

### Dogfooding is mandatory

The three built-in sources (notes-exist, word-count, tags) are written **against
the public API**, exactly as an external plugin would. If something is awkward to
express there, the API is wrong and the API gets fixed — not worked around with
privileged internal access.

There is **no injected resolver any more**. The date ⇄ note mapping used to be
handed to the built-in sources as a `PeriodicNoteResolver`, precisely because the
API did not offer it; it is now `api.resolveNote(date, granularity)`, part of the
contract, and the sources call it like anybody else. `SourceContext` is down to
`app`, `api` and this plugin's own `wordsPerDot` setting.

The API deliberately maps **date → note and not the reverse**, so a source cannot
ask "is this file a periodic note?". That is why `word-count` and `tags` index
**lazily**: the first time the calendar asks about a note they queue the read (or
the cache lookup) and contribute nothing, and the result lands on the next
repaint. At most a screenful of notes is ever read, whatever the vault's size.
Do not reintroduce an eager `periodicNotes()` sweep.

### Things the registry guarantees, and where they live

`src/api/calendar-api.ts` is the whole implementation. Four behaviours there are
not obvious from the contract and must survive refactors:

- **Overlapping repaints.** Every `decorate(cell)` opens a numbered pass, stored
  in a `WeakMap`. A promise only paints if the cell is still on that pass *and*
  still in the document. Without this a slow source repaints last month's data.
- **Value scaling.** A cell all of whose contributors declared a `valueScale` is
  painted immediately against the sum of those scales. The rest go into a
  microtask after the grid is decorated, because intensity needs the largest
  value on screen, which no single cell knows — and that largest is taken **per
  granularity**, or the month button's total would flatten every day cell.
- **Class namespacing.** `Dot.className` and `CellMetadata.classes` reach the DOM
  as `<source-id>-<class>`, sanitized. Never pass a source's raw string through.
- **Failure containment.** Three consecutive `getMetadata` throws sideline a
  source. `refresh(id)` or re-registering gives it another chance.

### `openView()` is the only supported way in, and its promise is a guarantee

The view type is **not** part of the contract, so a consumer that wants to show
the calendar calls `api.openView()` rather than hardcoding `'calendar-plus'`.
The registry only forwards to the host; the work is `activateView()` in
`main.ts`, and three things there are load-bearing:

- **It resolves only when `getSurfaces()` can see the view.** A revealed leaf may
  still be *deferred*, in which case `leaf.view` is a placeholder, `calendarViews`
  filters it out and a `revealDate()` right after would silently do nothing.
  `revealLeaf()` awaits the load, and `loadIfDeferred()` after it is the belt and
  braces.
- **It waits for `workspace.layoutReady`.** Sidebar leaves are restored
  asynchronously; a lookup before that reports no calendar when one is about to
  reappear. This is the same trap that keeps the view out of `onload`.
- **Overlapping calls share one promise** (`this.opening`). Leaves are looked up
  before the first `await`, so two independent runs would each find nothing and
  open two.

### Header period buttons are cells, and they run coarsest first

The row reads `2026 · S2 · Q3 · Aug` — **widest period on the left, narrowing to
the right**, which is the order a date is written in and the order the user
scans. The sequence is written down exactly once, as `HEADER_GRANULARITIES` in
`periodic/config.ts`, and reversing that array is the whole change.

It is also the **tab order**, for free: the buttons are real `<button>` elements
with no `tabindex` of their own, so the DOM order *is* the focus order. Verified
in the app — the four buttons report `tabindex === null` and the focus sequence
runs `2026 → S2 → Q3 → Aug` before the grid's roving tab stop. Never add a
`tabindex` to fix a visual order problem: it would split the two orders apart and
only one of them would stay correct.

`month`, `quarter`, `semester` and `year` only exist as header buttons, and the
`Granularity` type promises them. They are therefore real `CalendarCell`s (built
with `tag: 'button'`), live in `CalendarView.headerCells`, and are returned by
`getCells()` so that decoration, the active highlight and `cell-click` treat them
like any day. Anything that iterates cells must go through `getCells()`.

They also go through the **same delegated listeners** as the grid. `header.ts`
attaches no listener to a period button at all — clicks, context menus, hover
previews and drops all arrive through `findCell()`, whose selector is
`CELL_SELECTOR = '.day, .week-num, .calendar-plus-period'`. Two rules follow:

- Do not add a per-button listener back. The view already handles the event, so
  a second one would open the note twice (a `<button>` fires `click` on Enter and
  Space by itself).
- Keyboard navigation and the roving tab stop use `findGridCell()` instead,
  which returns null for a header button: it has no row and no column, and it is
  already in the tab order on its own.

### i18n: no string literals in the UI

Every visible string lives in `src/i18n/en.ts` and `src/i18n/es.ts`; `t(key,
params?)` resolves it. Rules that are easy to break:

- The language comes from `getLanguage()` — **never** `localStorage`, never a
  detection library (lint rule 28).
- `en.ts` is linted for sentence case by `sentence-case-locale-module`, which
  `eslint.config.mts` enables via `recommendedWithLocalesEn`. It rejects a value
  starting with a lowercase word or a digit, so no sentence fragments and no
  `'1 word'` — use `'{count} word'`. Brand names are allow-listed in the config.
- Command **ids** are never translated: they are what a user's hotkey is bound
  to. Only `name` goes through `t()`.
- Month and weekday names come from `moment`, already localized. Keep them out
  of the dictionaries or they will disagree with the resolved locale.
- A source's `name` is its own; only the built-in ones are translated, through
  `IndexedSource.nameKey`.

### Settings and the source list

Obsidian captures `getSettingDefinitions()` when the tab is **constructed**, so
sources are registered in `onload()` before `addSettingTab`, and a source that
registers later triggers `CalendarPlusSettingTab.refreshDefinitions()`, which
feature-detects 1.13's `update()`.

**`onSourcesChanged()` fires on both edges — registering *and* unregistering.**
This is not symmetry for its own sake; it is the fix for the bug that motivated
the whole change. `registerSource` used to notify and its returned `unregister`
did not, so an external source that arrived after the tab was built never got a
toggle. The user turned off all three built-in sources, the calendar went on
painting dots, and there was no control anywhere that could stop it — the dots
belonged to `simple-tasks`, which was registered and invisible. A source with no
toggle is a source the user cannot turn off, so **any code path that changes the
set of registered sources must call `host.onSourcesChanged()`**.

Driven in the app with the settings tab **open**: registering a probe source from
outside took the tab from 23 setting items to 24, the only new one being the
probe's own toggle; its `unregister()` took it back to 23 with nothing left over.
With every source disabled — the three built-ins *and* `simple-tasks` — the grid
went from 44 dots to **0 dots, 0 values and 0 footer cards**, which is the
behaviour the bug report said was impossible.

### `renderClassicSettings()` is the 1.10 path, and it has now been run

`display()` is dead code on the Obsidian we develop against — 1.13 renders
`getSettingDefinitions()` and never calls it — but `minAppVersion` is 1.10.0, so it
is the *only* settings UI a supported user might get. Untested code on a version we
promise to support is a promise we cannot keep, so it is exercised by calling
`tab.display()` directly on the live tab, which is exactly what an older Obsidian
does.

What the pass established (settings tab open, `saveSettings` stubbed to count
writes so `data.json` is never touched — verified afterwards by its unchanged md5):

- **Same surface as the declarative path**: 23 `.setting-item`s either way, the
  five group headings present, and **every** name in the declarative definitions
  also present in the classic UI. No empty names.
- **The controls are wired**: a toggle (`Show week numbers`), a dropdown
  (`Start week on`), a number field (`Words per dot`) and a text field
  (`Semester note format`) each changed the settings object and each triggered
  exactly one save.
- **The gates work**: turning semesters off drops exactly 3 rows (folder, format,
  template) and turning the footer off drops 1 (maximum cards); restoring both
  brings 23 back. In the classic path this is a re-render, not a `disabled`
  predicate, which is why it needs its own check.
- **The locale dropdown really is built from moment**: 139 options, the same
  number the declarative path reports.
- One toggle per registered source, `Simple Tasks` among them.

Gotcha for whoever asserts on this DOM: Obsidian's `DropdownComponent` renders
**two** `select` elements per dropdown, so `querySelectorAll('select').length` is
double the number of dropdowns (8 for 4). Count `.setting-item`s, not controls.

Also worth knowing: the classic path renders `semesterFolder` and
`semesterTemplate` as plain text inputs, where the declarative path gives folder
and file pickers. That is not a regression to fix — those control types did not
exist in 1.10 — but it is the one place the two paths deliberately differ.

### Source defaults are seeded once, and the mark is why

`notes-exist` ships **on**; `word-count` and `tags` ship **off**
(`DEFAULT_DISABLED_SOURCES` in `settings.ts`) — they are demonstrations of the
public API, not things most people want painted over their month.

`disabledSources` stores the sources the user turned **off**, so an absence means
"on". That is right for a source arriving from another plugin, but it makes
"never decided" and "deliberately switched on" indistinguishable in storage. So
the decision is recorded once, in `sourceDefaultsApplied`, and never revisited.
`resolveDisabledSources` in `src/domain/settings.ts` is the whole rule:

| stored state | result |
|---|---|
| no `data.json` at all | seed `DEFAULT_DISABLED_SOURCES`, write the mark |
| some config, no mark | **touch nothing**, write only the mark |
| mark present | leave it alone, write nothing |

`loadData()` returning `null` is the only honest signal that nobody has ever
configured the plugin in this vault — hence the `record !== null` test rather
than a check on some field being missing.

**Never "fix" this by disabling sources retroactively for people who already have
settings.** The mark exists precisely to make that impossible; without it, the
next version that adds a source to the default-off list would silently switch off
something a user had turned on by hand.

Verified in the app by stubbing `loadData`/`saveSettings` and calling the real
`loadSettings()` three times: a null store came back with
`['calendar-plus-word-count', 'calendar-plus-tags']` and one write; a store
holding `{ disabledSources: [], showWeekNumbers: false }` came back with
`disabledSources` still empty, `showWeekNumbers` still false and one write (the
mark only); an already-marked store came back untouched with **zero** writes.

### `hoverMode` decides who gets to speak on hover

Three values, and they are mutually exclusive by construction rather than by
luck:

- `preview` (default) — `onCellHover` fires `hover-link` and Obsidian's core Page
  preview takes over. The cell's tooltip stays the bare period label, because a
  tooltip under a popover is noise.
- `summary` — no `hover-link` at all, and the tooltip carries the label *plus*
  whatever the sources contributed.
- `none` — no `hover-link`, and `refreshLabel()` returns before `setTooltip`, so
  the element ends up with no tooltip attribute whatsoever.

The plugin stays in `workspace.hoverLinkSources` in all three modes; what changes
is whether the event is ever fired. Measured on a day with a note: `preview` gave
exactly 1 `hover-link` carrying the note's path, `summary` and `none` gave 0, and
only `none` left the cell with no `aria-label`.

The accessible name is **not** part of this trade-off. `.calendar-plus-a11y-name`
carries the full text in all three modes, so a screen reader still hears
`27 July 2026 · 2 tasks completed · 9 tasks open` even when the user asked for no
tooltip. A visual preference must never cost a11y information.

### The footer is `getSummary()`, and it is optional on purpose

`calendar/footer.ts` renders a strip of `SummaryCard`s under the grid, fed by the
**optional** `getSummary(from, to)` on the source contract. All three built-in
sources implement it; a source that does not simply contributes no card, and
`simple-tasks` is the live example of exactly that.

Three things are load-bearing:

- **The range is the displayed month**, not the 42 days the grid draws. The
  header says "August 2026"; a figure that quietly counted three days of July
  would contradict it.
- **An empty footer is `display: none`**, via the `is-empty` class, or every
  month with no notes would end in a stripe of nothing.
- **A card is a `<button>` only when it has an `onClick`.** One that looks
  pressable and does nothing is worse than a plain figure.

The strip is a **wrapping CSS grid** (`repeat(auto-fit, minmax(4.25rem, 1fr))`),
never a horizontal scroller: the sidebar already scrolls vertically, and a second
scroller inside it hides cards behind an edge with no affordance. `maxSummaryCards`
is what bounds the number of lines instead.

### `src/domain/` is where the testable logic lives

`pnpm test` is `node --test "src/**/*.test.ts"`: Node's native type stripping
runs the TypeScript directly, with no framework, no bundler and no build step.
The price is that **the whole module graph a test touches must be loadable by
Node**, and the `obsidian` package has no runtime at all — `"main": ""`, it is
types only. One `import { debounce } from 'obsidian'` anywhere in the graph and
the suite stops running.

So the pure logic was pulled out into `src/domain/`, and the rule is absolute:

- **A module in `src/domain/` imports nothing.** Not `obsidian`, not a sibling,
  not a type. `purity.test.ts` fails the build if one ever does.
- Everything there is a plain function over plain values. `semesterOfMonth`
  takes a month index rather than a `Moment`, so it can be checked without one.
- The Obsidian-facing modules keep their names and their doc comments and
  delegate: `resolve.ts` still exports `semesterOf(date)`, `tags.ts` still
  exports the source. Nothing outside had to change.

Two consequences worth remembering:

- **`.ts` extensions belong in test imports only.** Node resolves those paths
  itself and demands the extension (`from './semester.ts'`), which is why
  `tsconfig.json` sets `allowImportingTsExtensions` and `noEmit`. The bundled
  graph is resolved by esbuild and tsc, so it keeps the extensionless style —
  the repo is not half-converted, the two resolvers simply have different rules.
- **`verbatimModuleSyntax` is on.** Type stripping erases syntax without
  understanding it, so a type imported as a value would survive into a runtime
  import of something that does not exist. This turns that into a compile error.
- Node's strip-only mode rejects constructor parameter properties. `src/domain/`
  has no classes, so it does not come up; elsewhere they are fine, because
  esbuild transforms rather than strips.

`moment` is a devDependency pinned to the version the `obsidian` package depends
on, used by `semester.test.ts` alone. The plugin still takes `moment` from
Obsidian at runtime and nothing bundles the package — esbuild only follows
`src/main.ts`. The eslint override for `src/**/*.test.ts` says as much.

## Parity checklist

Every point below was driven in the running app against the test vault, in one
`obs eval` pass on 2026-08-01, and the evidence is recorded next to it. Re-run
that pass — not a reading of the code — before ticking anything new.

- [x] Month grid, weekday headers, week numbers (toggleable) — 42 `.day` cells
      in six fixed rows, 7 `th.weekday`, 6 `.week-num`; turning
      `showWeekNumbers` off leaves 0 and back on restores 6.
- [x] Previous/next month navigation and a "today" affordance — the arrows moved
      the header from `2026-08` to `2026-07` and back, and `.reset-button`
      returned to the current month from two months away.
- [x] Click a day → open its note; create it if missing (respecting the
      "confirm before create" setting) — clicking 2026-08-01 opened
      `Cronos/Diario/2026-08-01.md`; clicking a day with no note opened the
      confirmation modal with its two buttons, and cancelling created no file.
- [x] `Cmd/Ctrl+click` → open in a new tab — a click with `metaKey` took the
      markdown leaf count from 2 to 3.
- [x] Click a week number → weekly note, same behavior — opened
      `Cronos/Semanario/2026-W31.md`.
- [x] Hover a day → Obsidian's native page preview — a `pointerover` fired
      exactly one `hover-link` carrying the daily note's path, and
      `calendar-plus` is in `workspace.hoverLinkSources`.
- [x] Right-click a day → context menu — with `nativeMenus` off (macOS menus are
      native, so the DOM shows nothing otherwise) the menu came up headed by the
      period label, with open/delete entries plus the ones other plugins add
      through `file-menu`.
- [x] The day of the currently active note is highlighted — the cell of the file
      just opened carries `active`.
- [x] Week start setting, plus locale override — setting `weekStart: 'sunday'`
      moved `moment.localeData().firstDayOfWeek()` to 0 and the first column
      header from Mon to Sun; restoring put Mon back. The locale dropdown is
      built from moment's own 139 locales.
- [x] "Today" advances at midnight without a reload (1-minute heartbeat) —
      forcing the view's `today` to yesterday and awaiting one `tick()` moved the
      `today` class back to 2026-08-01. The tick was driven directly rather than
      waited out; what the clock is not proven to do is fire, only what the tick
      does when it fires. `registerInterval(HEARTBEAT_MS)` is what schedules it.
- [x] Dots for existing notes, word count, tags — 30 dots on the grid, carrying
      `calendar-plus-notes-exist-note` and `calendar-plus-tags-tag`. **Re-running
      this on a fresh install now gives dots from `notes-exist` only**, because
      the other two ship disabled; enable them first or the count will look like
      a regression when it is the new default.

Three behaviours beyond the original, checked in the same pass because they are
the ones most easily broken by a refactor:

- **Drops reach every cell.** With a probe source registered from outside, the
  `month`, `semester` and `year` buttons, a day and a week number all took a
  drag (`dragover` prevented, `is-drop-target` set, `onDrop` called with the
  right date and granularity, `date-drop` emitted once per drop). The `quarter`
  button, whose `canDrop` said no, refused the drag and never saw `onDrop`.
- **An unconfigured granularity is inert.** With `semesterEnabled` off,
  `api.resolveNote(date, 'semester')` is `null`, the semester button is not
  rendered, and no semester cell is handed to sources. Turning weekly notes off
  leaves the six week cells in the grid marked `is-unavailable`, claiming no
  note and resolving to `null`.
- **`openView()` opens exactly one calendar and its promise means something.**
  Driven from outside on 2026-08-01: with the view closed, `revealDate()` left
  the displayed month untouched; `await api.openView()` produced one leaf in
  19 ms with `isDeferred === false` and 42 day cells in the DOM, and the
  `revealDate()` right after it moved the calendar three months on. Calling it
  again with the view open, twice in a row, and twice concurrently from a closed
  state (the two calls got the *same* promise object) all left `leaves === 1` and
  one `.calendar-plus-view` node.

A second pass on **2026-08-09** drove the four UX changes above — button order and
tab order, every source off leaving zero dots, an external source's toggle
appearing and disappearing with the settings tab open, the three defaults cases,
the three `hoverMode` values, and the footer in both themes at 300 px, 240 px and
190 px. The evidence sits in each section rather than here.

A third pass, also on **2026-08-09**, covered what had never been run at all: the
plugin on an emulated **phone** (touch targets, no horizontal overflow), the whole
keyboard grid (arrows, `Home`/`End`, `PageUp`/`PageDown`, one roving tab stop, the
four header buttons with no `tabindex` of their own), the narrow layout **in the
light theme**, and `renderClassicSettings()`. Evidence in the Styling and Settings
sections above.

That pass also fixed the shape of the test itself: **simulate stored settings by
stubbing `loadData` and `saveSettings` on the plugin instance and calling the real
`loadSettings()`**, then `delete` both properties to fall back to the prototype.
Do not reason about `resolveDisabledSources` in isolation — it is pure and already
unit-tested; what needs driving is the wiring around it, including the fact that
`loadSettings()` *writes to disk* when it decides to set the mark.

## Verification

**Do not call the Obsidian CLI in a loop.** Those calls intermittently pull the
Obsidian window to the front and steal focus while the user is typing — measured at
roughly 1 in 3 runs for `dev:errors`. Over a session it makes the machine unusable.

Start with what needs no app:

```bash
pnpm build && pnpm lint && pnpm test
```

Reloading is automatic: the **Hot Reload** plugin watches `main.js` from inside
Obsidian, so `pnpm dev` never shells out. A `.hotreload` file marks this repo.

This plugin is inherently visual, so screenshots are unavoidable — but **batch them
into one pass at the end of a change, never one per tweak**:

```bash
obs dev:errors                     # `obs` = wrapper with a default vault and a timeout
obs dev:screenshot path=/tmp/cal.png
obs eval code="app.plugins.plugins['calendar-plus'].api.version"
```

`eval` measured 0/3 on stealing focus and `dev:errors` 1/3, so prefer asking the
app through `eval` — including for DOM assertions, which `eval` can do with
`document.querySelector`, instead of a separate `dev:dom` call.

## Styling

`styles.css` uses **only** Obsidian CSS variables — no literal colors, ever. The
original plugin's class names are worth mirroring where practical, so users'
existing CSS snippets keep working. Verify in both light and dark themes.

### The touch-target floor needs two signals, and one of them is not emulated

`--cp-touch-target` is declared on `.calendar-plus-view` (`0px`) and raised to
44 px by **both** `@media (pointer: coarse)` and `body.is-mobile`. That is not
belt-and-braces for its own sake: under `dev:mobile on`,
`matchMedia('(pointer: coarse)').matches` is **`false`**, so the rules that used to
live only inside that media query could never be seen to run — measured 41,5×27,6
day cells and 24×24 arrows on an emulated phone. `body.is-mobile` is what Obsidian
sets on every phone and tablet *and* on the emulator, so it makes the same floor
verifiable; `pointer: coarse` still earns its place for a desktop touchscreen.

Each rule reads the variable through `max()` against its desktop value, so the
declaration stays where the property already was instead of being restated inside a
conditional block.

Also measured: `dev:mobile on` alone gives `is-tablet`, because Obsidian decides
phone versus tablet by width. `window.resizeTo(414, 900)` from `eval` is what makes
it `is-phone` — and it works, unlike `setSize` on a split.
