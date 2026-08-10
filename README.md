# Calendar Plus

A calendar for your periodic notes in Obsidian — and one that other plugins can
extend.

Click a day to open its note. Click a week number for the weekly note. Use the row
above the grid to reach the month, quarter, semester and year. Calendar Plus reads
the configuration you already have in core **Daily notes** and in the **Periodic
Notes** plugin, so there is nothing to set up twice.

<!-- SCREENSHOT (hero): the calendar in the right sidebar of a real vault — month
     grid with week numbers, the period shortcut row "2026 · S2 · Q3 · Aug", dots on
     days that have notes, and two or three footer cards. Light theme, ~300 px wide.
     This is the image that sells the plugin; it goes right here. -->

## Why this exists

[Calendar](https://github.com/liamcain/obsidian-calendar-plugin) by Liam Cain is
the plugin that defined what a calendar in Obsidian's sidebar should feel like, and
Calendar Plus owes it its entire interaction design. It is MIT licensed, and this is
a reimplementation rather than a fork.

Three things prompted the rewrite, none of them a complaint about the original:

- It has been **unmaintained since 2024** — a fact about a maintainer's
  availability, not about the quality of the work.
- Its interface lives in **`obsidian-calendar-ui`**, a package unmaintained since
  2023, on Svelte and Rollup. Fixing anything in the view means maintaining that
  package too.
- **Other plugins cannot contribute to it.** This is the real reason. Anything you
  might want to see on a day — tasks, habits, words written, a workout — would have
  to be built into the calendar itself.

So Calendar Plus has two goals, in this order: **parity**, because anyone switching
over should not miss a thing, and **extensibility**, through a documented
[public API](docs/api.md) that any plugin can register a source against. The three
sources that ship with it are written against that same API, with no privileged
access — they are the reference implementation.

It also adds **all six periodic-note levels**, not just daily and weekly.

## Install

**From the community catalog** — not there yet; this plugin has not been submitted
for review. Once it is: Settings → Community plugins → Browse → "Calendar Plus".

**With BRAT**, which is how to try it today:

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the community
   catalog and enable it.
2. Command palette → **BRAT: Add a beta plugin for testing**.
3. Enter `alex-roc/calendar-plus` and confirm.
4. Enable **Calendar Plus** in Settings → Community plugins.

BRAT installs from the latest GitHub release and will offer updates as new ones
appear.

**Manually**: download `main.js`, `manifest.json` and `styles.css` from a
[release](https://github.com/alex-roc/calendar-plus/releases) into
`<vault>/.obsidian/plugins/calendar-plus/`, then reload Obsidian.

Requires Obsidian 1.10 or later. Works on desktop and mobile.

## Using it

Open the calendar from the ribbon icon or the **Open view** command.

| Action | Result |
|---|---|
| Click a cell | Opens that period's note, creating it if it does not exist |
| `Cmd`/`Ctrl` + click | Opens it in a new tab |
| Click a week number | The weekly note |
| Right-click | Context menu: open, delete, plus whatever other plugins add |
| Arrows, `Home`/`End`, `PageUp`/`PageDown`, `Enter` | Full keyboard navigation |

The row above the grid — `2026 · S2 · Q3 · Aug`, widest period first — reaches the
year, semester, quarter and month notes. Only the periods you have configured
appear in it. Today's highlight follows the clock across midnight without a reload,
and the day of the note you are editing is highlighted too.

### The six periods

| Period | Configured in | Default format |
|---|---|---|
| Day | Periodic Notes `daily`, else core **Daily notes** | `YYYY-MM-DD` |
| Week | Periodic Notes `weekly` | `gggg-[W]ww` |
| Month | Periodic Notes `monthly` | `YYYY-MM` |
| Quarter | Periodic Notes `quarterly` | `YYYY-[Q]Q` |
| Semester | **Calendar Plus settings** | `YYYY-[S]{semester}` |
| Year | Periodic Notes `yearly` | `YYYY` |

A period with no configuration is simply not offered, rather than creating notes in
a folder you did not ask for. Semesters have no Periodic Notes equivalent, so they
are a Calendar Plus convention and are off until you enable them: semester 1 is
January to June, semester 2 July to December.

### Sources

A **source** puts information on calendar cells — dots, a number, CSS classes, a
tooltip — and optionally a card in the footer strip under the grid. It is asked
about every cell on screen, header period buttons included. Three ship with the
plugin, each with its own toggle:

| Source | Default | What it shows |
|---|---|---|
| **Existing notes** | on | A dot on every period whose note exists — the classic behaviour, now optional |
| **Word count** | off | Dots and a value from the note's word count |
| **Tags** | off | A colored dot per tag on the note |

Any plugin can register a source and it gets a toggle in the same list, with no
configuration and no restart.

<!-- SCREENSHOT: the same month with all three built-in sources on and "Numbers from
     sources" set to intensity, so dots and shaded cells are both visible. Dark
     theme, to show that the plugin follows the theme. -->

<!-- SCREENSHOT: the Sources section of the settings tab, showing the three built-in
     toggles plus one registered by another plugin — the evidence for the claim
     above. -->

## Documentation

- **[User guide](docs/user-guide.md)** — the view, the six periods, semesters,
  sources, the footer, hovering, keyboard, commands, language and styling.
- **[Settings reference](docs/settings.md)** — every control and its default.
- **[API](docs/api.md)** — for plugin developers: registering a source, and
  contributing dots, numbers, menu items, drops and footer cards.

For plugin authors, the short version:

```ts
const api = getCalendarPlusApi(this.app); // null when Calendar Plus is absent
if (api) {
	this.register(
		api.registerSource({
			id: 'my-plugin',
			name: 'My plugin',
			getMetadata: (date, granularity) => ({ value: myIndex.countIn(date, granularity) }),
		})
	);
}
```

The contract is [`src/api/types.ts`](src/api/types.ts) — copy it into your plugin
and check `api.version === 1`. Everything it promises is documented in
[docs/api.md](docs/api.md).

## Contributing

Bug reports and pull requests are welcome. Adding a language is one file: copy
`src/i18n/en.ts`, translate the values and register it in `src/i18n/index.ts` — the
keys are typed, so a missing string is a compile error rather than a blank label.

```bash
pnpm install
pnpm dev     # watch and rebuild
pnpm build   # typecheck and bundle
pnpm lint
pnpm test    # unit tests: node --test straight over the TypeScript, no framework
```

Needs Node 22.18+ for the native type stripping the tests use. Reloading in
Obsidian is handled by [Hot Reload](https://github.com/pjeby/hot-reload), which
watches `main.js` from inside the app. Conventions are in
[`AGENTS.md`](AGENTS.md).

### Testing in your own vault

BRAT installs from a published release, so iterating through it means a tag and a
release per change. For development, build straight into the vault instead:

```bash
OBSIDIAN_DEPLOY_TO="$HOME/path/to/YourVault/.obsidian/plugins/calendar-plus" pnpm dev
```

Every successful build copies `main.js`, `manifest.json` and `styles.css` there,
plus the `.hotreload` marker, so Hot Reload picks it up. Save, and the change is
live.

Copying rather than symlinking is deliberate: this repo carries a large
`node_modules` and a `.git` directory, and a symlink would place both inside a
vault that iCloud, Dropbox or Syncthing is watching.

## Credits

The interaction design, the feature set and the CSS class names derive from
[obsidian-calendar-plugin](https://github.com/liamcain/obsidian-calendar-plugin)
by Liam Cain, MIT licensed. Class names are kept deliberately compatible so that
CSS snippets written for it keep working here. Thank you.

## License

[MIT](LICENSE). See [NOTICE](NOTICE) for the relationship to the original.
